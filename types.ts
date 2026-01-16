export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  suggestions?: string[];
  timestamp: Date;
}

export interface NonnyAdminAction {
  status: 'Update Required' | 'No Action';
  sql: string | null;
  comparison: string | null;
  retrain_json: string | null;
}

export interface NonnyResponse {
  response: string;
  suggestions: string[];
  admin_action: NonnyAdminAction;
}
