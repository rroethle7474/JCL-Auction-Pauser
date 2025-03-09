// ==UserScript==
// @name         Fantrax Auction Auto-Pauser (Debug)
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Automatically pauses auction timer after player nomination (with enhanced debugging)
// @author       You
// @match        https://www.fantrax.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const config = {
        // How often to check for changes (in milliseconds)
        checkInterval: 1000,
        // Debug mode to display console messages - SET TO FALSE TO DISABLE LOGS
        debug: false,
        // Set to false after first pause to prevent multiple clicks
        canPause: true,
        // Track current player to detect nominations
        currentPlayer: null,
        // Store timer state (paused/live)
        timerState: 'unknown',
        // Track waiting state
        isWaiting: false,
        // Timer for initialization attempts
        initRetries: 0,
        // Maximum initialization attempts
        maxInitRetries: 20,
        // Track if a nomination just happened (to prevent immediate pause on timer reset)
        // justNominated: false,
        // Cooldown period after nomination (in milliseconds)
        nominationCooldown: 10000, // 10 seconds cooldown
        // Track button clicks while player name hasn't changed
        buttonClicks: {
            live: 0,
            pause: 0,
            lastPlayerName: null,
            totalClicksSamePlayer: 0
        }
    };

    // Logging function that only works when debug is enabled
    function log(message) {
        if (config.debug) {
            console.log(`[Auction Pauser] ${message}`);
        }
    }

    // Enhanced logging for DOM elements
    function debugElement(element, name) {
        if (!config.debug) return;

        if (!element) {
            console.log(`[Auction Pauser] ${name}: Not found`);
            return;
        }

        console.log(`[Auction Pauser] ${name}:`, {
            element: element,
            tagName: element.tagName,
            className: element.className,
            id: element.id,
            text: element.textContent ? element.textContent.substring(0, 50) : 'no text',
            rect: element.getBoundingClientRect ? element.getBoundingClientRect() : 'no rect'
        });
    }

    // Set up a timer observer to monitor changes to the timer
    function setupTimerObserver() {
        log('Setting up timer observer');
        
        // Function to check for the draft-timer element
        const checkForTimer = () => {
            const draftTimer = document.querySelector('draft-timer');
            if (draftTimer) {
                log('Found draft-timer element, setting up observer');
                debugElement(draftTimer, 'Draft Timer for Observer');
                
                // Set up a mutation observer to watch for changes to the timer
                const timerObserver = new MutationObserver((mutations) => {
                    // Extract the timer value whenever it changes
                    const timerValue = extractTimerValue();
                    if (timerValue) {
                        log(`Timer updated: ${timerValue.minutes}:${timerValue.seconds} (${timerValue.totalSeconds} seconds)`);
                        
                        // You can add additional logic here based on timer changes
                        // For example, detect when timer starts or stops
                    }
                });
                
                // Start observing the timer element
                timerObserver.observe(draftTimer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                
                // Initial extraction
                extractTimerValue();
                
                return true;
            }
            return false;
        };
        
        // Try to find the timer immediately
        if (!checkForTimer()) {
            // If not found, set up an interval to keep checking
            const timerCheckInterval = setInterval(() => {
                if (checkForTimer()) {
                    clearInterval(timerCheckInterval);
                    log('Timer observer setup complete');
                }
            }, 1000); // Check every second
        }
    }

    // Wait for page to fully load
    function initialize() {
        log(`Initialization attempt ${config.initRetries + 1}/${config.maxInitRetries}`);

        if (config.initRetries >= config.maxInitRetries) {
            log('Maximum initialization attempts reached. Proceeding with current state.');
            setupUI();
            setupTimerObserver();
            monitorTimerControls(); // Add timer controls monitoring
            main();
            return;
        }

        const bodyReady = document.body && document.body.classList.contains('fantrax-app');
        const pageLoaded = document.readyState === 'complete';
        const hasAuctionElements = document.querySelector('.draft-timer, .draft__navbar__center, .scorer__info__name');
        
        if (bodyReady && pageLoaded && hasAuctionElements) {
            log('Page appears to be fully loaded');
            setupUI();
            setupTimerObserver();
            monitorTimerControls(); // Add timer controls monitoring
            main();
        } else {
            config.initRetries++;
            log(`Page not ready yet. Body: ${bodyReady}, ReadyState: ${document.readyState}, AuctionElements: ${!!hasAuctionElements}`);
            setTimeout(initialize, 500);
        }
    }

    // Set up the UI elements
    function setupUI() {
        // Create notification element for status updates
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '10px';
        notification.style.right = '10px';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        notification.style.color = 'white';
        notification.style.padding = '10px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '9999';
        notification.style.fontSize = '14px';
        notification.style.fontWeight = 'bold';
        notification.style.display = 'none';
        notification.id = 'auction-pauser-notification';
        document.body.appendChild(notification);

        // Create status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.style.position = 'fixed';
        statusIndicator.style.top = '10px';
        statusIndicator.style.left = '10px';
        statusIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        statusIndicator.style.color = 'white';
        statusIndicator.style.padding = '8px';
        statusIndicator.style.borderRadius = '5px';
        statusIndicator.style.zIndex = '9999';
        statusIndicator.style.fontSize = '12px';
        statusIndicator.id = 'auction-pauser-status';
        document.body.appendChild(statusIndicator);

        updateStatusIndicator('Initializing...');
        showNotification('Auction Pauser Active');

        // Add toggle button
        addToggleButton();

        // Start the main loop
        setTimeout(main, 1000);
    }

    // Function to update status indicator
    function updateStatusIndicator(message) {
        const indicator = document.getElementById('auction-pauser-status');
        if (indicator) {
            indicator.innerHTML = `<b>Auto-Pauser Status:</b><br>${message}`;
        }
    }

    // Function to show notifications
    function showNotification(message, duration = 3000) {
        const notification = document.getElementById('auction-pauser-notification');
        if (notification) {
            notification.textContent = message;
            notification.style.display = 'block';

            // Hide after duration
            setTimeout(() => {
                notification.style.display = 'none';
            }, duration);
        }
    }

    // Function to get current player name
    function getCurrentPlayerName() {
        // First, locate the specific auction bar container
        const auctionBar = document.querySelector('league-draft-auction-bar');
        
        if (!auctionBar) {
            console.log("Auction bar not found");
            return null;
        }
        
        // Now search for the player name only within this container
        const playerNameLink = auctionBar.querySelector('div.scorer__info__name > a');
        if (playerNameLink) {
            const playerName = playerNameLink.textContent.trim();
            
            // If this is a new player, update the lastPlayerName and reset all counters
            if (config.buttonClicks.lastPlayerName !== playerName) {
                log(`Player changed from ${config.buttonClicks.lastPlayerName} to ${playerName}`);
                config.buttonClicks.lastPlayerName = playerName;
                config.buttonClicks.totalClicksSamePlayer = 0;
                config.buttonClicks.live = 0;  // Reset live clicks counter
                config.buttonClicks.pause = 0; // Reset pause clicks counter
            }
            
            return playerName;
        }
        
        // Fallback to just the div.scorer__info__name content within the auction bar
        const playerNameElement = auctionBar.querySelector('div.scorer__info__name');
        if (playerNameElement) {
            const playerName = playerNameElement.textContent.trim();
            
            // If this is a new player, update the lastPlayerName and reset all counters
            if (config.buttonClicks.lastPlayerName !== playerName) {
                config.buttonClicks.lastPlayerName = playerName;
                config.buttonClicks.totalClicksSamePlayer = 0;
                config.buttonClicks.live = 0;  // Reset live clicks counter
                config.buttonClicks.pause = 0; // Reset pause clicks counter
            }
            
            return playerName;
        }
    
        // Additional fallbacks within the auction bar
        const selectors = [
            'div.scorer__info__name',
            '[data-test="nominated-player-name"]',
            'div.scorer__info h1, div.scorer__info h2, div.scorer__info h3',
            '.scorer__info a'
        ];
    
        for (const selector of selectors) {
            const element = auctionBar.querySelector(selector);
            if (element && element.textContent.trim().length > 0) {
                return element.textContent.trim();
            }
        }
    
        return null;
    }

    // Function to check if we're in the "Waiting..." state
    function checkWaitingState() {
        const waitingElements = findElementsWithText('Waiting...');
        const draftCenterElement = document.querySelector('.draft__navbar__center');

        // Check if there's "Waiting..." text anywhere in the page
        if (waitingElements.length > 0) {
            return true;
        }

        // Or specifically in the navbar center if that element exists
        if (draftCenterElement && draftCenterElement.textContent.includes('Waiting...')) {
            return true;
        }

        return false;
    }

    // Helper function to find elements containing specific text
    function findElementsWithText(text) {
        const elements = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    return node.nodeValue.includes(text) ?
                        NodeFilter.FILTER_ACCEPT :
                        NodeFilter.FILTER_REJECT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            elements.push(node.parentElement);
        }
        return elements;
    }

    // Function to detect when a player has been nominated
    function checkForNomination(timerValue) {
        // Get current timer state (LIVE/PAUSED)
        const liveElements = findElementsWithText('Live');
        const pausedElements = findElementsWithText('Paused');
        if (liveElements.length > 0 && pausedElements.length === 0) {
            config.timerState = 'live';
        } else if (pausedElements.length > 0 && liveElements.length === 0) {
            config.timerState = 'paused';
        }

        // Check waiting state
        const isWaitingNow = checkWaitingState();
        // console.log("Is waiting now:", isWaitingNow);
        // Get current player name
        const playerName = getCurrentPlayerName();
        // console.log("Player name:", playerName);
        // log(`Current player name: ${playerName || 'None'}`);

        // Update status indicator
        updateStatusIndicator(`
            Waiting: ${isWaitingNow ? 'Yes' : 'No'}<br>
            Timer: ${config.timerState}<br>
            Current Player: ${playerName || 'None'}<br>
            Auto-Pause: ${config.canPause ? 'Ready' : 'Waiting for unpause'}<br>
            Clicks for ${config.buttonClicks.lastPlayerName || 'current player'}: ${config.buttonClicks.totalClicksSamePlayer}<br>
            Total Live Clicks: ${config.buttonClicks.live}<br>
            Total Pause Clicks: ${config.buttonClicks.pause}
        `);

        // If we were in waiting state and now we have a player name, it's a new nomination
        if (config.isWaiting && !isWaitingNow && playerName && playerName !== config.currentPlayer && config.timerState === 'live' && config.canPause) {
            config.currentPlayer = playerName;
            
            // Reset all click counters for the new nomination
            config.buttonClicks.totalClicksSamePlayer = 0;
            config.buttonClicks.live = 0;
            config.buttonClicks.pause = 0;
            log(`New nomination detected: ${playerName} - Reset all click counters`);
            
            // Set the justNominated flag to prevent immediate pause on timer reset
            // config.justNominated = true;
            // log('Setting nomination cooldown to prevent immediate pause');
            
            // Clear the flag after the cooldown period
            setTimeout(() => {
                // config.justNominated = false;
                log('Nomination cooldown ended, normal pause rules apply');
            }, config.nominationCooldown);
            
            //pauseTimer();
        }
        console.log("Config.isWaiting:", config.isWaiting);s
        // console.log("Config.isNomination:", config.justNominated);
        console.log("Config.canPause:", config.canPause);
        console.log("Config.buttonClicks.pause:", config.buttonClicks.pause);
        console.log("Timer value:", timerValue);
        // Automatically pause if pause counter is 0 and timer is below 10 seconds
        // But don't pause if we just had a nomination (to prevent pausing on timer reset)
        if (!config.isWaiting && config.canPause && config.buttonClicks.pause === 0 && 
            timerValue && timerValue.totalSeconds <= 15 && timerValue.totalSeconds > 0) {
            console.log("Pausing timer as it is below 10 seconds and pause counter is 0");
            pauseTimer();
        }

        // Update waiting state for next check
        config.isWaiting = isWaitingNow;

        // console.log("Is waiting:", isWaitingNow);
        // console.log("Can Pause:", config.canPause);
        // If player changed but we're not in waiting state, update the current player
        if (playerName && playerName !== config.currentPlayer && !isWaitingNow) {
            // log(`Player changed to: ${playerName}`);
            config.currentPlayer = playerName;
        }
    }

    // Extract timer value from draft-timer element
    function extractTimerValue() {
        const draftTimerElement = document.querySelector('draft-timer');
        if (draftTimerElement) {
            // Get the text content and clean it
            const timerText = draftTimerElement.textContent.trim();
            // First try to extract direct child text nodes (which should be the timer numbers)
            let minutes = 0;
            let seconds = 0;
            
            // Get all direct text nodes and elements
            const childNodes = Array.from(draftTimerElement.childNodes);
            // Find the minute and second values
            let foundText = 0; // hack to prevent seconds from being set since minutes are always first
            for (let i = 0; i < childNodes.length; i++) {
                const node = childNodes[i];
                // If it's a text node with a number
                if (node.nodeType === Node.TEXT_NODE && /\d+/.test(node.textContent)) {
                    const num = parseInt(node.textContent.trim(), 10);
                    
                    // If we haven't set minutes yet, this is minutes
                    if (foundText === 0) {
                        minutes = num;
                        foundText++;
                    } 
                    // Otherwise it's seconds
                    else {
                        seconds = num;
                        break;
                    }
                }
            }
            
            // If we found both values
            if (seconds !== 0 || minutes !== 0) {
                const totalSeconds = minutes * 60 + seconds;
                return { minutes, seconds, totalSeconds };
            }
            
            // Fallback to regex if direct node extraction failed
            const timerMatch = timerText.match(/(\d+)\s*:\s*(\d+)/);
            if (timerMatch) {
                console.log("Found timer match:", timerMatch);
                minutes = parseInt(timerMatch[1], 10);
                seconds = parseInt(timerMatch[2], 10);
                const totalSeconds = minutes * 60 + seconds;
                return { minutes, seconds, totalSeconds };
            }
        }
        
        return null;
    }

    // Function to click the pause button
    function pauseTimer() {
        log('Attempting to pause timer');
        console.log("Attempting to pause timer");
        // Set canPause to false immediately to prevent multiple calls
        // This prevents race conditions where multiple calls might occur before the first one completes
        if (!config.canPause) {
            log('Pause already in progress, ignoring duplicate call');
            return;
        }
        
        config.canPause = false;

        // Find the draft status container
        const statusContainer = document.querySelector('.draft__navbar__status');
        console.log("Status container:", statusContainer);

        if (statusContainer) {
            // Look for the span with the text or the mat-icon inside the h6
            const h6Element = statusContainer.querySelector('h6');
            const spanElement = h6Element ? h6Element.querySelector('span[data-click-monitored="true"]') : null;
            const iconElement = h6Element ? h6Element.querySelector('mat-icon') : null;
            
            
            // Try clicking the most specific clickable element first
            let clickableElement = null;
            
            if (spanElement && spanElement.getAttribute('data-click-monitored') === 'true') {
                clickableElement = spanElement;
            } else if (iconElement) {
                clickableElement = iconElement;
            } else if (h6Element) {
                clickableElement = h6Element;
            } else {
                // Last resort - try the container itself
                clickableElement = statusContainer;
            }

            if (clickableElement) {
                clickableElement.click();
                config.buttonClicks.pause++;
                
                // Listen for the next unpause
                waitForUnpause();
            } else {
                // If we couldn't find a clickable element, re-enable pausing after a delay
                log('No clickable element found for timer control!');
                showNotification('Error: Clickable element for timer control not found', 5000);
                setTimeout(() => { config.canPause = true; }, 5000);
            }
        } else {
            // If we couldn't find the status container, re-enable pausing after a delay
            log('Draft status container not found!');
            showNotification('Error: Draft status container not found', 5000);
            setTimeout(() => { config.canPause = true; }, 5000);
        }
    }

    // Function to wait for manual unpause to re-enable the script
    function waitForUnpause() {
        // Observer to detect when the auction resumes
        const observer = new MutationObserver((mutations) => {
            // Look for indications the timer is running again (Live indicator)
            const liveElements = findElementsWithText('Live');
            const pausedElements = findElementsWithText('Paused');

            if (liveElements.length > 0 && pausedElements.length === 0) {
                config.canPause = true;
                observer.disconnect();
                showNotification('Ready for next nomination', 3000);
            }
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    // Main function that runs periodically
    function main() {
        // Check and log the current timer value
        const timerValue = extractTimerValue();
        
        checkForNomination(timerValue);
        setTimeout(main, config.checkInterval);
    }

    // Function to reset all click counters
    function resetClickCounters() {
        config.buttonClicks.live = 0;
        config.buttonClicks.pause = 0;
        config.buttonClicks.totalClicksSamePlayer = 0;
        
        log(`Manually reset all click counters`);
        
        // Update the status display
        updateStatusIndicator(`
            Waiting: ${config.isWaiting ? 'Yes' : 'No'}<br>
            Timer: ${config.timerState}<br>
            Current Player: ${config.currentPlayer || 'None'}<br>
            Auto-Pause: ${config.canPause ? 'Ready' : 'Waiting for unpause'}<br>
            Clicks for ${config.buttonClicks.lastPlayerName || 'current player'}: ${config.buttonClicks.totalClicksSamePlayer}<br>
            Total Live Clicks: ${config.buttonClicks.live}<br>
            Total Pause Clicks: ${config.buttonClicks.pause}
        `);
        
        showNotification('Click counters reset', 2000);
    }

    // Add a toggle button to enable/disable the script
    function addToggleButton() {
        const button = document.createElement('button');
        button.textContent = 'Auto-Pause: ON';
        button.style.position = 'fixed';
        button.style.bottom = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '5px 10px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';

        let enabled = true;

        button.addEventListener('click', () => {
            enabled = !enabled;
            button.textContent = `Auto-Pause: ${enabled ? 'ON' : 'OFF'}`;
            button.style.backgroundColor = enabled ? '#4CAF50' : '#F44336';
            config.canPause = enabled;
            showNotification(`Auto-pause ${enabled ? 'enabled' : 'disabled'}`, 2000);
        });

        document.body.appendChild(button);
        
        // Add a reset counters button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset Counters';
        resetButton.style.position = 'fixed';
        resetButton.style.bottom = '10px';
        resetButton.style.right = '120px'; // Position to the left of the toggle button
        resetButton.style.zIndex = '9999';
        resetButton.style.padding = '5px 10px';
        resetButton.style.backgroundColor = '#2196F3'; // Blue color
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        
        resetButton.addEventListener('click', resetClickCounters);
        
        document.body.appendChild(resetButton);
    }

    // Wait for page to fully load before starting
    window.addEventListener('load', () => {
        log('Page load event fired');
        // Start initialization with a slight delay to ensure DOM is stable
        setTimeout(initialize, 1000);
    });

    // Also try to initialize if the load event already fired
    if (document.readyState === 'complete') {
        log('Document already complete, initializing');
        setTimeout(initialize, 1000);
    }

    // Function to monitor timer state changes and button clicks
    function monitorTimerControls() {
        log('Setting up timer controls monitor');
        
        // Find potential timer control buttons
        const findTimerButtons = () => {
            // Find pause/live buttons
            const pauseSelectors = [
                '[data-test="pause-button"]',
                '.timer-control-button',
                '.timer-toggle-button',
                '.pause-button',
                '.timer-control'
            ];
            
            // Try selector-based approach first
            let buttons = [];
            for (const selector of pauseSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements && elements.length > 0) {
                        elements.forEach(element => {
                            buttons.push(element);
                            debugElement(element, `Potential timer control button found with selector: ${selector}`);
                        });
                    }
                } catch (e) {
                    log(`Error with selector ${selector}: ${e.message}`);
                }
            }
            
            // Also try to find by text content
            const liveElements = findElementsWithText('Live');
            const pausedElements = findElementsWithText('Paused');
            
            // Add live elements and their clickable parents
            liveElements.forEach(element => {
                const parent = element.closest('button, a, div[role="button"]');
                if (parent) {
                    buttons.push(parent);
                    debugElement(parent, 'Clickable parent of LIVE text');
                } else {
                    buttons.push(element);
                    debugElement(element, 'Live text element');
                }
            });
            
            // Add paused elements and their clickable parents
            pausedElements.forEach(element => {
                const parent = element.closest('button, a, div[role="button"]');
                if (parent) {
                    buttons.push(parent);
                    debugElement(parent, 'Clickable parent of PAUSED text');
                } else {
                    buttons.push(element);
                    debugElement(element, 'Paused text element');
                }
            });
            
            // Also try to find the draft-timer element
            const draftTimer = document.querySelector('draft-timer');
            if (draftTimer) {
                const parent = draftTimer.closest('button, a, div[role="button"]');
                if (parent) {
                    buttons.push(parent);
                    debugElement(parent, 'Clickable parent of draft-timer');
                }
            }
            
            // Remove duplicates
            buttons = [...new Set(buttons)];
            
            log(`Found ${buttons.length} potential timer control buttons`);
            return buttons;
        };
        
        // Function to handle button clicks
        const handleButtonClick = (event) => {
            // Get the current player name
            const currentPlayerName = getCurrentPlayerName();
            
            // Determine if this is a live or pause button
            const buttonText = event.target.textContent.toLowerCase();
            const isPauseButton = buttonText.includes('pause') || 
                                 event.target.classList.contains('pause-button') ||
                                 event.target.closest('.pause-button');
            const isLiveButton = buttonText.includes('live') || 
                               event.target.classList.contains('live-button') ||
                               event.target.closest('.live-button');
            
            // Update click counters
            if (isPauseButton) {
                config.buttonClicks.pause++;
                log(`Pause button clicked (total: ${config.buttonClicks.pause})`);
            } else if (isLiveButton) {
                config.buttonClicks.live++;
                log(`Live button clicked (total: ${config.buttonClicks.live})`);
            } else {
                // Generic timer control button
                if (config.timerState === 'live') {
                    config.buttonClicks.pause++;
                    log(`Timer control clicked while live (counted as pause, total: ${config.buttonClicks.pause})`);
                } else {
                    config.buttonClicks.live++;
                    log(`Timer control clicked while paused (counted as live, total: ${config.buttonClicks.live})`);
                }
            }
            
            // Log a summary of the current state
            log(`Current player: ${currentPlayerName || 'None'} | Live clicks: ${config.buttonClicks.live} | Pause clicks: ${config.buttonClicks.pause} | Total clicks for this player: ${config.buttonClicks.totalClicksSamePlayer}`);
            
            // Check if player name has changed
            if (config.buttonClicks.lastPlayerName !== currentPlayerName) {
                // Player name changed, reset counter
                log(`Player changed from ${config.buttonClicks.lastPlayerName} to ${currentPlayerName}, resetting click counter`);
                config.buttonClicks.totalClicksSamePlayer = 0;
                config.buttonClicks.lastPlayerName = currentPlayerName;
            } else {
                // Same player, increment counter
                config.buttonClicks.totalClicksSamePlayer++;
                log(`Button clicked for same player ${currentPlayerName} (total: ${config.buttonClicks.totalClicksSamePlayer})`);
            }
            
            // Update status display
            updateStatusIndicator(`
                Timer: ${config.timerState}<br>
                Current Player: ${config.currentPlayer || 'None'}<br>
                Auto-Pause: ${config.canPause ? 'Ready' : 'Waiting for unpause'}<br>
                Clicks for ${config.buttonClicks.lastPlayerName || 'current player'}: ${config.buttonClicks.totalClicksSamePlayer}<br>
                Total Live Clicks: ${config.buttonClicks.live}<br>
                Total Pause Clicks: ${config.buttonClicks.pause}
            `);
        };
        
        // Set up click listeners for timer control buttons
        const setupButtonListeners = () => {
            const buttons = findTimerButtons();
            
            // Add click listeners to all buttons
            buttons.forEach(button => {
                // Use a data attribute to avoid adding multiple listeners
                if (!button.dataset.clickMonitored) {
                    button.addEventListener('click', handleButtonClick);
                    button.dataset.clickMonitored = 'true';
                    log(`Added click listener to button: ${button.textContent.trim().substring(0, 20)}`);
                }
            });
            
            return buttons.length > 0;
        };
        
        // Try to set up listeners immediately
        if (!setupButtonListeners()) {
            // If no buttons found, set up an interval to keep trying
            const buttonCheckInterval = setInterval(() => {
                if (setupButtonListeners()) {
                    clearInterval(buttonCheckInterval);
                    log('Timer control buttons monitoring setup complete');
                }
            }, 2000); // Check every 2 seconds
        }
        
        // Also set up a mutation observer to catch dynamically added buttons
        const observer = new MutationObserver((mutations) => {
            setupButtonListeners();
        });
        
        // Start observing the document
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
})();