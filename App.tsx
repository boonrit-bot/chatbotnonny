import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, NonnyResponse } from './types';
import { getNonnyResponse, getRandomSuggestions } from './services/nonnyService';
import { NONNY_NAME } from './constants';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality } from '@google/genai';
import { decode, decodeAudioData, createAudioBlob } from './services/audioUtils';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live API specific states and refs
  const liveSessionPromise = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const outputAudioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscriptionRef = useRef<string>('');
  const currentOutputTranscriptionRef = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim()) return;

    const newUserMessage: ChatMessage = {
      id: Date.now().toString() + 'user',
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const botResponseData: NonnyResponse = await getNonnyResponse(messageText);

      const newBotMessage: ChatMessage = {
        id: Date.now().toString() + 'bot',
        text: botResponseData.response,
        sender: 'bot',
        suggestions: botResponseData.suggestions,
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, newBotMessage]);
    } catch (error) {
      console.error('Error fetching bot response:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString() + 'error',
        text: 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล. กรุณาลองใหม่อีกครั้ง.',
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSendMessage(inputMessage);
    }
  }, [inputMessage, isLoading, handleSendMessage]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    if (!isLoading) {
      handleSendMessage(suggestion);
    }
  }, [isLoading, handleSendMessage]);

  // Live API Handlers
  const handleLiveMessage = useCallback(async (message: LiveServerMessage) => {
    // Handle transcription updates
    if (message.serverContent?.outputTranscription) {
      currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
    } else if (message.serverContent?.inputTranscription) {
      currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
    }

    if (message.serverContent?.turnComplete) {
      const fullInputTranscription = currentInputTranscriptionRef.current;
      const fullOutputTranscription = currentOutputTranscriptionRef.current;

      if (fullInputTranscription.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + 'user-voice-transcription',
            text: fullInputTranscription,
            sender: 'user',
            timestamp: new Date(),
          },
        ]);
      }
      if (fullOutputTranscription.trim()) {
        // Corrected: getRandomSuggestions is now imported and callable.
        // It's used here to generate suggestions for a bot's voice response transcription,
        // aligning with the rule that every response must display suggestions.
        const botSuggestions = getRandomSuggestions(); 
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + 'bot-voice-transcription',
            text: fullOutputTranscription,
            sender: 'bot',
            suggestions: botSuggestions,
            timestamp: new Date(),
          },
        ]);
      }
      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';
    }

    // Process audio output
    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64EncodedAudioString && outputAudioContextRef.current) {
      nextStartTimeRef.current = Math.max(
        nextStartTimeRef.current,
        outputAudioContextRef.current.currentTime,
      );
      const audioBuffer = await decodeAudioData(
        decode(base64EncodedAudioString),
        outputAudioContextRef.current,
        24000, // Fixed sample rate for output
        1,
      );
      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      source.addEventListener('ended', () => {
        outputAudioSourcesRef.current.delete(source);
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
      outputAudioSourcesRef.current.add(source);
    }

    // Handle interruption
    const interrupted = message.serverContent?.interrupted;
    if (interrupted) {
      for (const source of outputAudioSourcesRef.current.values()) {
        source.stop();
        outputAudioSourcesRef.current.delete(source);
      }
      nextStartTimeRef.current = 0;
    }
  }, []);

  const startLiveSession = useCallback(async () => {
    setIsLoading(true);
    setIsRecording(true);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';
    nextStartTimeRef.current = 0;
    outputAudioSourcesRef.current.forEach(source => source.stop());
    outputAudioSourcesRef.current.clear();

    try {
      // Request microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Fixed: Use type assertion for window.webkitAudioContext as per guidelines
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      // Fixed: Use type assertion for window.webkitAudioContext as per guidelines
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      // Buffer size for ScriptProcessorNode, must be one of 256, 512, 1024, 2048, 4096, 8192, 16384
      scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        const pcmBlob = createAudioBlob(inputData, 16000); // Input sample rate for Live API is 16000

        liveSessionPromise.current?.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);

      // Initialize GoogleGenAI for Live API call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      liveSessionPromise.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => console.debug('Live session opened'),
          onmessage: handleLiveMessage,
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e);
            stopLiveSession();
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString() + 'live-error',
                text: 'การสนทนาด้วยเสียงขัดข้อง กรุณาลองใหม่อีกครั้ง.',
                sender: 'bot',
                timestamp: new Date(),
              },
            ]);
          },
          onclose: (e: CloseEvent) => {
            console.debug('Live session closed:', e);
            stopLiveSession();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: "คุณคือนนท์นี่ เจ้าหน้าที่แชทบอทอัจฉริยะและ Database & Training Manager ประจำวิทยาลัยอาชีวศึกษาภูเก็ต. คุณสุภาพ เป็นกันเอง มีความเป็นมืออาชีพ และทำงานบนความถูกต้องของข้อมูล 100%. ตอบคำถามเพียง 1 ประโยคเท่านั้น ห้ามขยายความหรืออธิบายยาวเด็ดขาด.",
          inputAudioTranscription: {}, // Enable transcription for user input audio.
          outputAudioTranscription: {}, // Enable transcription for model output audio.
        },
      });

      // Await the session to be ready before allowing sends
      await liveSessionPromise.current;
      setIsLoading(false);

    } catch (error) {
      console.error('Error starting live session:', error);
      setIsRecording(false);
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + 'mic-error',
          text: 'ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาตรวจสอบสิทธิ์.',
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
    }
  }, [handleLiveMessage]);

  const stopLiveSession = useCallback(() => {
    setIsRecording(false);
    setIsLoading(false);

    liveSessionPromise.current?.then(session => session.close());
    liveSessionPromise.current = null;

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    outputAudioSourcesRef.current.forEach(source => source.stop());
    outputAudioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const handleMicButtonClick = useCallback(() => {
    if (isRecording) {
      stopLiveSession();
    } else {
      startLiveSession();
    }
  }, [isRecording, startLiveSession, stopLiveSession]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 rounded-t-lg shadow-md">
        <h1 className="text-xl font-bold text-center">AI Chatbot: {NONNY_NAME}</h1>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-3 rounded-xl max-w-[70%] shadow-sm ${
              msg.sender === 'user'
                ? 'bg-blue-500 text-white rounded-br-none'
                : 'bg-gray-200 text-gray-800 rounded-bl-none'
            }`}>
              <p className="text-sm break-words">{msg.text}</p>
              {msg.suggestions && msg.suggestions.length > 0 && msg.sender === 'bot' && (
                <div className="mt-2 flex flex-wrap gap-2 justify-start">
                  {msg.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="px-3 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-full hover:bg-indigo-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50"
                      disabled={isLoading}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <div className={`text-[0.65rem] mt-1 ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 text-gray-800 p-3 rounded-xl rounded-bl-none max-w-[70%] shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-300"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-white p-4 border-t border-gray-200 flex items-center shadow-md rounded-b-lg">
        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="พิมพ์ข้อความที่นี่..."
          className="flex-1 p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          disabled={isLoading || isRecording}
        />
        <button
          onClick={() => handleSendMessage(inputMessage)}
          className="ml-3 px-5 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || isRecording || !inputMessage.trim()}
        >
          ส่ง
        </button>
        <button
          onClick={handleMicButtonClick}
          className={`ml-3 p-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400 hover:bg-gray-500'} text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${isRecording ? 'focus:ring-red-500' : 'focus:ring-gray-400'} transition-colors duration-200`}
          aria-label={isRecording ? 'หยุดบันทึกเสียง' : 'เริ่มบันทึกเสียง'}
          disabled={isLoading}
        >
          {isRecording ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0v-1a7 7 0 0114 0v1z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18v3m-3-3h6M5 11h14" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default App;