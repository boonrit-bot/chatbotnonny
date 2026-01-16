import { NonnyResponse, NonnyAdminAction } from '../types';
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
  let botResponse: string | null = null; // Initialize as null to explicitly check if it has been set

  let finalAdminAction: NonnyAdminAction = {
    status: "No Action", // Default status
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
    // --- New Admin Review Logic (runs after specific business logic) ---
    const adminKeywords = ["อัปเดตข้อมูล", "ข้อมูลใหม่", "แก้ไข", "เปลี่ยนข้อมูล", "เพิ่มข้อมูล", "ไม่ถูกต้อง", "อยากให้แก้"];
    const needsAdminReview = adminKeywords.some(keyword => lowerCaseMessage.includes(keyword));

    if (needsAdminReview) {
      botResponse = "ขอบคุณสำหรับข้อมูลค่ะ/ครับ นนท์นี่จะนำข้อมูลนี้ไปตรวจสอบและอัปเดตให้นะคะ/ครับ";
      finalAdminAction = {
        status: "Update Required",
        sql: null, // No SQL generation in frontend context
        comparison: null,
        retrain_json: JSON.stringify({
          user_input: userMessage,
          detected_intent: "admin_review",
          timestamp: new Date().toISOString(),
          // In a full implementation, more context or extracted data would be added here.
        }),
      };
    }
    // --- New prphuketvc.ac.th Data Source Rule (runs after admin review logic) ---
    else if (lowerCaseMessage.includes("prphuketvc.ac.th") || lowerCaseMessage.includes("เว็บไซต์วิทยาลัย")) {
      botResponse = "ข้อมูลที่คุณต้องการอาจอยู่ในเว็บไซต์ www.prphuketvc.ac.th ค่ะ/ครับ";
    }
    // --- Gemini API Fallback for general queries (runs if no specific, admin, or website rule matched) ---
    else {
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
        let geminiRawResponse = response.text;

        // Post-process Gemini's response to ensure it's a single sentence and not empty.
        if (geminiRawResponse) {
          const sentences = geminiRawResponse.split(/[.!?]\s*/);
          botResponse = sentences[0].trim();
          // Add back a period if multiple sentences were split and the first part is non-empty.
          if (sentences.length > 1 && botResponse.length > 0 && botResponse.length < (geminiRawResponse.length || 0)) {
            botResponse += ".";
          }
        }
      } catch (error) {
        console.error('Error calling Gemini API:', error);
        botResponse = `ขออภัย เกิดข้อผิดพลาดทางเทคนิค. กรุณาติดต่อ ${NONNY_NAME} อีกครั้งภายหลัง.`;
      }
    }
  }

  // Final fallback if botResponse is still not set (e.g., Gemini returns nothing)
  if (!botResponse || botResponse.length === 0) {
    botResponse = "กรุณาติดต่อหน้าเคาน์เตอร์งานทะเบียน อาคารปฏิพัทธ์ ชั้น 1.";
  }


  return {
    response: botResponse,
    suggestions: getRandomSuggestions(),
    admin_action: finalAdminAction,
  };
};