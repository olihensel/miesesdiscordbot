
-- user with most messages
SELECT u.display_name, u.id, count(u.id) as count
FROM "discord_message" m
left join discord_user u on m.from_id = u.id
WHERE timestamp between '2021-01-01' and '2022-01-01' 
GROUP BY u.display_name, u.id
ORDER BY count  DESC
LIMIT 50


-- user with most emotes
SELECT count(emote) as count, emote
FROM "discord_message_flat_emotes"
WHERE timestamp between '2021-01-01' and '2022-01-01' 
GROUP BY emote
ORDER BY count(emote) desc
LIMIT 10

-- message by month
SELECT count(id) as count,
EXTRACT(MONTH from timestamp) as month
FROM discord_message
WHERE timestamp between '2021-01-01' and '2022-01-01' 
GROUP BY month
ORDER BY month asc

-- message by day of week (0=sunday)
SELECT count(id) as count,
EXTRACT(DOW from timestamp) as dayofweek
FROM discord_message
WHERE timestamp between '2021-01-01' and '2022-01-01' 
GROUP BY dayofweek
ORDER BY dayofweek asc

-- message by hour
SELECT count(id) as count,
EXTRACT(hour from timestamp) as hour
FROM discord_message
WHERE timestamp between '2021-01-01' and '2022-01-01' 
GROUP BY hour
ORDER BY hour asc

-- count of used emotes
select sum(a.emote_length) from (SELECT array_length(emotes,1) as emote_length FROM discord_message WHERE array_length(emotes,1) is not null ORDER BY emote_length desc) a

-- count of messages, words, letters
SELECT count(id) as message_count,
sum(word_count) as word_count,
sum(message_length) as message_length
FROM discord_message
WHERE timestamp between '2021-01-01' and '2022-01-01' 

-- thanks absolute
SELECT count(msg.id) as count, u.display_name, u.username FROM (SELECT * FROM discord_message WHERE words && '{"danke", "bitte", "dankeschön", "bitteschön", "thx", "ty"}') msg
LEFT JOIN discord_user u on u.id = msg.from_id
GROUP BY u.username, u.display_name
ORDER BY count desc
limit 100

-- thanks relative to sent messages
select danke.count as dankecount, danke.display_name, danke.username, count(msg.id) as messagecount, danke.count / CAST (count(msg.id) as FLOAT) as ratio
FROM(SELECT count(msg.id) as count, u.id, u.display_name, u.username 
FROM (SELECT * FROM discord_message WHERE words && '{"danke", "bitte", "dankeschön", "bitteschön", "thx", "ty"}') msg
LEFT JOIN discord_user u on u.id = msg.from_id
WHERE msg.timestamp between '2021-01-01' and '2022-01-01'
GROUP BY u.username, u.display_name, u.id
ORDER BY count desc
limit 10) danke
left join discord_message msg on msg.from_id = danke.id
group by danke.display_name, danke.username, danke.count
order by ratio desc

-- most reacting person
SELECT u.display_name, u.username, count(u.username) as count FROM "discord reaction users" ru
LEFT JOIN discord_user u on ru.discord_user_id = u.id
GROUP BY u.display_name, u.username
ORDER BY count desc
LIMIT 50

-- most emote using person
SELECT u.username, u.display_name, count(u.username) as count FROM "discord_message_flat_emotes" m
JOIN discord_user u on u.id = m.from_id
GROUP BY u.username, u.display_name
ORDER BY count desc
LIMIT 50

-- pingmaster
SELECT u.username, count(u.username) count
FROM "discord_message_mentions_without_replies" me
LEFT JOIN discord_message m on me.discord_message_id = m.id LEFT JOIN discord_user u on m.from_id = u.id
GROUP BY u.username
ORDER BY count desc
LIMIT 50

-- pongmaster :D :D

SELECT u.username, count(u.username) count
FROM "discord_message_mentions_without_replies" me
LEFT JOIN discord_message m on me.discord_message_id = m.id LEFT JOIN discord_user u on me.discord_user_id = u.id GROUP BY u.username
ORDER BY count desc
LIMIT 50

-- best gesprächspartner
select COALESCE(reply_receiver.username, reply_sender.username), reply_sender.count as send_count, reply_receiver.count as receive_count, COALESCE(reply_sender.count,0) + COALESCE(reply_receiver.count,0) as sum
from (SELECT u.username, count(u.username) count
FROM "discord_message_mentions_only_replies" me
LEFT JOIN discord_message m on me.discord_message_id = m.id
LEFT JOIN discord_user u on me.discord_user_id = u.id
GROUP BY u.username
ORDER BY count desc
LIMIT 100) reply_receiver
full outer join (
SELECT u.username, count(u.username) count
FROM "discord_message_mentions_only_replies" me
LEFT JOIN discord_message m on me.discord_message_id = m.id
LEFT JOIN discord_user u on m.from_id = u.id
GROUP BY u.username
ORDER BY count desc
LIMIT 100) reply_sender on reply_receiver.username = reply_sender .username
order by sum desc