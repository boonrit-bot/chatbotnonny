import { NonnyResponse } from '../types';
import { SUGGESTION_GROUPS, NONNY_NAME } from '../constants';
import { GoogleGenAI } from '@google/genai';

/**
 * Generates three random suggestions from the predefined SUGGESTION_GROUPS.
 * @returns An array of three random suggestion strings.
 */
export const getRandomSuggestions = (): string[] => {
  const shuffled = SUGGESTION_GROUPS.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 3);
};

/**
 * Simulates the Nonny chatbot's response logic based on user input.
 * Adheres to the specified rules for sentence limit, suggestions, and specific logic.
 *
 * @param userMessage The message from the user.
 * @returns A promise that resolves to a NonnyResponse object.
 */
export const getNonnyResponse = async (userMessage: string): Promise<NonnyResponse> => {
  // Initialize GoogleGenAI here to ensure the latest API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const lowerCaseMessage = userMessage.toLowerCase();
  let botResponse: string;

  const defaultAdminAction = {
    status: "No Action" as const,
    sql: null,
    comparison: null,
    retrain_json: null,
  };

  // --- Specific Business Logic (takes precedence) ---
  if (lowerCaseMessage.includes("ค่าเทอม ปวส.")) {
    // Finance Logic: ค่าเทอม ปวส. ต้องคำนวณจาก [ค่าบำรุง + (22 หน่วยกิต x 100 บาท)] เสมอ
    const fee = 1500; // Example ค่าบำรุง
    const credits = 22;
    const creditCost = 100;
    const totalFee = fee + (credits * creditCost);
    botResponse = `ค่าเทอม ปวส. โดยประมาณคือ ${totalFee} บาท (ค่าบำรุง ${fee} บาท + ${credits} หน่วยกิต x ${creditCost} บาท).`;
  } else if (lowerCaseMessage.includes("ปวช.")) {
    // Program Logic: ปวช.: มีรูปแบบการเรียนปกติ, ทวิภาคี(เฉพาะสาขาธุรกิจค้าปลีก) รูปแบบ ปกติ และ MEP เท่านั้น (ห้ามตอบว่ามี EP)
    botResponse = `หลักสูตร ปวช. มีรูปแบบการเรียนปกติ และ MEP เท่านั้น.`;
  } else if (lowerCaseMessage.includes("ปวส.")) {
    // Program Logic: ปวส.: มีรูปแบบ ปกติ, ทวิภาคี, MEP และ EP
    botResponse = `หลักสูตร ปวส. มีรูปแบบการเรียนปกติ, ทวิภาคี, MEP และ EP.`;
  } else if (lowerCaseMessage.includes("ติดต่อ")) {
    botResponse = `คุณสามารถติดต่อสอบถามเพิ่มเติมได้ที่งานทะเบียน อาคารปฏิพัทธ์ ชั้น 1.`;
  } else {
    // --- Gemini API Fallback for general queries ---
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview", // Using the specified model for general chat
        contents: { parts: [{ text: userMessage }] },
        config: {
          systemInstruction: "คุณคือนนท์นี่ เจ้าหน้าที่แชทบอทอัจฉริยะและ Database & Training Manager ประจำวิทยาลัยอาชีวศึกษาภูเก็ต. คุณสุภาพ เป็นกันเอง มีความเป็นมืออาชีพ และทำงานบนความถูกต้องของข้อมูล 100%. ตอบคำถามเพียง 1 ประโยคเท่านั้น ห้ามขยายความหรืออธิบายยาวเด็ดขาด.",
          maxOutputTokens: 50, // Enforce brevity
          thinkingConfig: { thinkingBudget: 25 }, // Reserve tokens for thinking
        },
      });
      botResponse = response.text || "ขออภัย ไม่เข้าใจคำถามของคุณ. กรุณาลองใหม่อีกครั้ง.";
      // Ensure the response is a single sentence if Gemini returns more.
      // This is a post-processing step to strictly enforce the rule, in case Gemini deviates.
      const sentences = botResponse.split(/[.!?]\s*/);
      botResponse = sentences[0].trim();
      // Fixed: Reference botResponse instead of botResponseData.text
      if (sentences.length > 1 && botResponse.length < (response.text?.length || 0)) {
        botResponse += "."; // Add back a period if multiple sentences were split.
      }
      if (botResponse.length === 0) { // Fallback if splitting leaves an empty string
        botResponse = "ขออภัย ไม่เข้าใจคำถามของคุณ. กรุณาลองใหม่อีกครั้ง.";
      }

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      botResponse = `ขออภัย เกิดข้อผิดพลาดทางเทคนิค. กรุณาติดต่อ ${NONNY_NAME} อีกครั้งภายหลัง.`;
    }
  }

  return {
    response: botResponse,
    suggestions: getRandomSuggestions(),
    admin_action: defaultAdminAction,
  };
};