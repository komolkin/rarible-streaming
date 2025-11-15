-- Enable Realtime for streams table to broadcast viewer count updates
ALTER PUBLICATION supabase_realtime ADD TABLE streams;
