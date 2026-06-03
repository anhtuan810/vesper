-- Persist the agent loop's structured tool result (a scenario card payload) with
-- the assistant message, so the inline card rehydrates when chat history reloads.
-- Nullable and additive: the tag-emission path simply leaves it null.
alter table messages add column if not exists tool_result jsonb;
