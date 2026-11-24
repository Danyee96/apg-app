'use strict';

// Never let a different online account take ownership of an offline queue.
async function reconnect(session, userId, username, password) {
  if (!userId || typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password || password.length > 128) throw new Error('Enter your account credentials.');
  try {
    const result = await session.login(username, password);
    if (result.userId !== String(userId)) throw new Error('Sign in with the same account used offline.');
    return result;
  } catch (error) { session.clear(); throw error; }
}
module.exports = { reconnect };
