# Fantrax Auction Auto-Pauser

A Tampermonkey script that automatically pauses the auction timer on Fantrax during fantasy sports drafts.

## Features

- Automatically pauses the timer when a new player is nominated
- Automatically pauses the timer when it drops below 15 seconds
- Visual status indicator showing the current state
- Toggle button to enable/disable auto-pausing
- Reset button to clear click counters

## Installation

### Step 1: Install Tampermonkey

1. Open Google Chrome
2. Go to the [Chrome Web Store](https://chrome.google.com/webstore)
3. Search for "Tampermonkey" or go directly to the [Tampermonkey page](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
4. Click "Add to Chrome" and confirm the installation

### Step 2: Install the Script

1. Click on the Tampermonkey icon in your browser toolbar (it looks like a black square with two white circles)
2. Select "Create a new script"
3. Delete any default code in the editor
4. Copy the entire content of the `pauser.js` file
5. Paste it into the Tampermonkey editor
6. Click "File" > "Save" or press Ctrl+S (Cmd+S on Mac)

### Step 3: Configure the Script (Optional)

You can modify the following settings at the top of the script:

- `checkInterval`: How often to check for changes (in milliseconds)
- `debug`: Set to `true` to enable detailed console logging
- `nominationCooldown`: Cooldown period after a nomination (in milliseconds)

## How It Works

### Overview

The script monitors the Fantrax auction draft page and automatically pauses the timer in two scenarios:

1. When a new player is nominated
2. When the timer drops below 15 seconds (if it hasn't been paused yet)

### Technical Details

The script works by:

1. **Initialization**: When you load the Fantrax draft page, the script initializes and sets up observers to monitor the page.

2. **Player Nomination Detection**: The script monitors the "Waiting..." state and detects when a new player is nominated by checking for changes in the player name displayed.

3. **Timer Monitoring**: The script continuously extracts the current timer value from the draft-timer element.

4. **Automatic Pausing**: 
   - When a new player is nominated, the script attempts to pause the timer by clicking the appropriate element.
   - When the timer drops below 15 seconds and hasn't been paused yet for the current player, it will also attempt to pause.

5. **Pause Prevention**: To prevent multiple pause attempts, the script sets a flag (`canPause`) to false after attempting to pause, and only resets it when the timer is manually unpaused.

6. **UI Elements**: The script adds:
   - A status indicator in the top-left corner showing the current state
   - A notification system for important events
   - A toggle button to enable/disable auto-pausing
   - A reset button to clear click counters

## Troubleshooting

If the script isn't working as expected:

1. Make sure Tampermonkey is enabled
2. Check that the script is enabled in Tampermonkey
3. Try refreshing the Fantrax page
4. Enable debug mode by setting `debug: true` in the script configuration
5. Open the browser console (F12 or Ctrl+Shift+J) to view debug logs

## License

This script is provided as-is with no warranty. Use at your own risk.
