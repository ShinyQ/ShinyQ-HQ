# Ask

- Date: 2026-10-17

Owner request: "i've seen that the chatbot has no context of the full conversation right what we needs to do so we could handle that is there any extra cost?". Decision: the assistant remembers the last 3 turns. The server signs every model answer (HMAC with `ASK_COOKIE_KEY`) and drops any earlier turn whose signature fails, so a visitor cannot forge an answer; earlier turns are context only and never change the rules; a short follow-up is scope-checked and retrieved with the question it refers to; follow-ups skip the KV cache; the body limit grows from 2 KB to 8 KB. A **New chat** button (ID "Obrolan baru") replaces "Clear chat", and switching the panel language forgets the memory. Cost: about 36 neurons for a first turn and about 44 for a follow-up with 3 turns (free allocation 10,000 a day).
