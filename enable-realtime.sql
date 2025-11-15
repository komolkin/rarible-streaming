-- Enable Realtime for chat_messages table
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- Enable Realtime for streams table (for viewer count and status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE streams;
