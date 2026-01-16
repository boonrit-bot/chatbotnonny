import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, NonnyResponse } from './types';
import { getNonnyResponse } from './services/nonnyService';
import { NONNY_NAME } from './constants';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, []); // Empty dependency array means this function is created once

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
          disabled={isLoading}
        />
        <button
          onClick={() => handleSendMessage(inputMessage)}
          className="ml-3 px-5 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          ส่ง
        </button>
      </div>
    </div>
  );
};

export default App;
