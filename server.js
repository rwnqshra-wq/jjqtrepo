// This file exists at the root level purely as a foolproof entrypoint for Render.
// It simply loads the actual server located in the server/ directory.
// This ensures that even if the Render Start Command is misconfigured to "node server.js", it will still work perfectly.
require('./server/server.js');
