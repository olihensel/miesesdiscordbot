DROP TABLE IF EXISTS "discord_message_flat_emotes";
CREATE VIEW "discord_message_flat_emotes" AS SELECT discord_message.id,
    unnest(discord_message.emotes) AS emote,
    discord_message."timestamp",
    discord_message.from_id,
    discord_message.channel_id
   FROM discord_message;

DROP TABLE IF EXISTS "discord_message_flat_words";
CREATE VIEW "discord_message_flat_words" AS SELECT discord_message.id,
    unnest(discord_message.words) AS word,
    discord_message."timestamp",
    discord_message.from_id,
    discord_message.channel_id
   FROM discord_message;

DROP TABLE IF EXISTS "discord_message_mentions_only_replies";
CREATE VIEW "discord_message_mentions_only_replies" AS SELECT m.discord_message_id,
    m.discord_user_id
   FROM (discord_message_mentions m
     LEFT JOIN discord_message msg ON (((msg.id)::text = (m.discord_message_id)::text)))
  WHERE ((msg.plain_text)::text !~~ (('%<@'::text || (m.discord_user_id)::text) || '>%'::text));

DROP TABLE IF EXISTS "discord_message_mentions_without_replies";
CREATE VIEW "discord_message_mentions_without_replies" AS SELECT m.discord_message_id,
    m.discord_user_id
   FROM (discord_message_mentions m
     LEFT JOIN discord_message msg ON (((msg.id)::text = (m.discord_message_id)::text)))
  WHERE ((msg.plain_text)::text ~~ (('%<@'::text || (m.discord_user_id)::text) || '>%'::text));

DROP TABLE IF EXISTS "discord_message_reaction_count";
CREATE VIEW "discord_message_reaction_count" AS SELECT m.id,
    m.plain_text,
    m.words,
    m.emotes,
    m.message_length,
    m.word_count,
    m."timestamp",
    m.from_id,
    m.channel_id,
    COALESCE(sum(re.count), (0)::bigint) AS reactions
   FROM (discord_message m
     LEFT JOIN discord_reaction re ON (((re.message_id)::text = (m.id)::text)))
  GROUP BY m.id
  ORDER BY COALESCE(sum(re.count), (0)::bigint) DESC;

DROP TABLE IF EXISTS "discord_reaction_with_timestamps";
CREATE VIEW "discord_reaction_with_timestamps" AS SELECT r.emote,
    r.count,
    m."timestamp"
   FROM (discord_reaction r
     LEFT JOIN discord_message m ON (((m.id)::text = (r.message_id)::text)));

