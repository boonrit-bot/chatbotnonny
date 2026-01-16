import { NonnyResponse } from '../types';
import { SUGGESTION_GROUPS, NONNY_NAME } from '../constants';

/**
 * Simulates a delay for an asynchronous operation.
 * @param ms The number of milliseconds to delay.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Generates three random suggestions from the predefined SUGGESTION_GROUPS.
 * @returns An array of three random suggestion strings.
 */
const getRandomSuggestions = (): string[] => {
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
  await delay(500); // Simulate API latency

  const lowerCaseMessage = userMessage.toLowerCase();
  let botResponse: string;

  // Fix: Ensure the `status` property matches the literal type defined in `NonnyAdminAction`.
  const defaultAdminAction = {
    status: "No Action" as const, // Use 'as const' to assert the literal type
    sql: null,
    comparison: null,
    retrain_json: null,
  };

  if (lowerCaseMessage.includes("ค่าเทอม ปวส.")) {
    // Finance Logic: ค่าเทอม ปวส. ต้องคำนวณจาก [ค่าบำรุง + (22 หน่วยกิต x 100 บาท)] เสมอ
    const fee = 1500; // Example ค่าบำรุง
    const credits = 22;
    const creditCost = 100;
    const totalFee = fee + (credits * creditCost);
    botResponse = `ค่าเทอม ปวส. โดยประมาณคือ ${totalFee} บาท (ค่าบำรุง ${fee} บาท + ${credits} หน่วยกิต x ${creditCost} บาท).`;
  } else if (lowerCaseMessage.includes("ปวช.")) {
    // Program Logic: ปวช.: มีเฉพาะรูปแบบ ปกติ และ MEP เท่านั้น (ห้ามตอบว่ามี EP)
    botResponse = `หลักสูตร ปวช. มีรูปแบบการเรียนปกติ และ MEP เท่านั้น.`;
  } else if (lowerCaseMessage.includes("ปวส.")) {
    // Program Logic: ปวส.: มีรูปแบบ ปกติ, ทวิภาคี, MEP และ EP
    botResponse = `หลักสูตร ปวส. มีรูปแบบการเรียนปกติ, ทวิภาคี, MEP และ EP.`;
  } else if (lowerCaseMessage.includes("ติดต่อ")) {
    botResponse = `คุณสามารถติดต่อสอบถามเพิ่มเติมได้ที่งานทะเบียน อาคารปฏิพัทธ์ ชั้น 1.`;
  } else {
    // Fallback: หากไม่พบข้อมูล ให้ตอบว่า "กรุณาติดต่องานทะเบียน อาคารปฏิพัทธ์ ชั้น 1" พร้อมปุ่มติดต่อ
    botResponse = `กรุณาติดต่องานทะเบียน อาคารปฏิพัทธ์ ชั้น 1.`;
  }

  return {
    response: botResponse,
    suggestions: getRandomSuggestions(),
    admin_action: defaultAdminAction,
  };
};