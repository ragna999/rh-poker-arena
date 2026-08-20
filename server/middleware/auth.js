// Auth middleware
// Wallet-based authentication: sign message to prove ownership

const { getAgentByApiKey, getAgentByWallet } = require('../../db/redis');

async function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  const agent = await getAgentByApiKey(apiKey);
  if (!agent) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.agent = agent;
  next();
}

function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    getAgentByApiKey(apiKey).then(agent => {
      req.agent = agent;
      next();
    }).catch(() => next());
  } else {
    next();
  }
}

module.exports = { authMiddleware, optionalAuth };
