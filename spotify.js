// spotify.js

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const url = require('url');
const Store = require('electron-store');
const store = new Store({name:'SpotifyAuth'});

const CLIENT_ID = '0c0b6393f8824bed83fbaf3fc78a1f1e';  // <-- Replace this!
const REDIRECT_URI = 'http://localhost:8888/callback';
const AUTH_PORT = 8888;
const SCOPES = 'user-library-modify';

// Native fetch replacement for Electron CommonJS environment
function fetch(urlString, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = options;

    const urlObj = new URL(urlString);

    const requestOptions = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data),
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        req.write(body);
      } else if (body instanceof URLSearchParams) {
        req.write(body.toString());
      }
    }

    req.end();
  });
}

function base64URLEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

async function authorizeWithPKCE() {
  const codeVerifier = base64URLEncode(crypto.randomBytes(64));
  const codeChallenge = base64URLEncode(sha256(codeVerifier));

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('scope', SCOPES);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/callback') {
        const authCode = parsed.query.code;

        if (!authCode) {
          res.end('Authorization failed: no code received.');
          server.close();
          return reject(new Error('No authorization code received'));
        }

        try {
          // Exchange code for tokens
          const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code: authCode,
              redirect_uri: REDIRECT_URI,
              client_id: CLIENT_ID,
              code_verifier: codeVerifier
            }).toString()
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.error) {
            res.end(`Authorization failed: ${tokenData.error_description}`);
            server.close();
            return reject(new Error(tokenData.error_description));
          }

          // Save tokens securely
          store.set('spotify', {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: Date.now() + tokenData.expires_in * 1000
          });

          res.end('Authorization successful! You can close this tab.');
          server.close();
          resolve();
        } catch (err) {
          res.end('Authorization failed.');
          server.close();
          reject(err);
        }
      }
    });

    server.listen(AUTH_PORT, () => {
      const { shell } = require('electron');
      shell.openExternal(authUrl.toString());
    });
  });
}

async function refreshAccessToken() {
  const refreshToken = store.get('spotify.refresh_token');
  if (!refreshToken) throw new Error('No refresh token available, please login again.');

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID
    }).toString()
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    throw new Error(tokenData.error_description);
  }

  store.set('spotify.access_token', tokenData.access_token);

  if (tokenData.expires_in) {
    store.set('spotify.expires_in', Date.now() + tokenData.expires_in * 1000);
  }

  return tokenData.access_token;
}

async function getAccessToken() {
  const tokenInfo = store.get('spotify');
  if (!tokenInfo) throw new Error('Not authorized, please login first.');

  if (!tokenInfo.access_token || !tokenInfo.expires_in || Date.now() >= tokenInfo.expires_in) {
    return refreshAccessToken();
  }

  return tokenInfo.access_token;
}

async function likeTrack(artist, title) {
  const accessToken = await getAccessToken();

  const query = encodeURIComponent(`${artist} ${title}`);
  const searchUrl = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Spotify search error: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();

  if (!searchData.tracks || !searchData.tracks.items.length) {
    throw new Error('Track not found on Spotify');
  }

  const trackId = searchData.tracks.items[0].id;

  const likeUrl = `https://api.spotify.com/v1/me/tracks?ids=${trackId}`;
  const likeRes = await fetch(likeUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (![200, 204].includes(likeRes.status)) {
    throw new Error('Failed to add track to liked songs');
  }

  return true;
}

module.exports = {
  authorizeWithPKCE,
  likeTrack
};
