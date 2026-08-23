export interface IMessagePayload {
  id: string;
  role: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatar: string;
  shared: boolean;
  summarized: boolean;
  hasFiles: boolean;
  attachedFiles: { fileId: string; filename: string }[];
  runId?: string | null;
  createdAt: string;
}
