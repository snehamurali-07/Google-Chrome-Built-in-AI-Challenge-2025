// This script runs in the extension's service worker context.
// NOTE: This version uses the Cloud Gemini API via fetch() due to local Gemini Nano API unavailability.

const SUBMENU_SUMMARIZE_ID = "NANO_SUMMARIZE";
const SUBMENU_REWRITE_ID = "NANO_REWRITE";
const SUBMENU_PROOFREAD_ID = "NANO_PROOFREAD";
const SUBMENU_CUSTOM_PROMPT_ID = "NANO_CUSTOM";
const SUBMENU_TRANSLATE_ID = "NANO_TRANSLATE"; // NEW
const ACTION_SET_API_KEY = "SET_API_KEY"; 

const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";
const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

let GEMINI_API_KEY = "";

// --- Initialization and Setup ---
chrome.runtime.onInstalled.addListener(() => {
  // Load API key from storage on install/update
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      GEMINI_API_KEY = result.geminiApiKey;
      console.log("Gemini API Key loaded from storage.");
    }
  });

  // Clear existing menus (prevents duplicates after updates)
  chrome.contextMenus.removeAll(() => {
    
    // 1. Top-Level: Set API Key (available everywhere)
    chrome.contextMenus.create({ 
        id: ACTION_SET_API_KEY, 
        title: "⚙️ Set Gemini API Key...", 
        contexts: ["all"] // Shows this item when right-clicking anywhere
    });

    // 2. Parent menu item for AI Tasks (Only visible when text is selected)
    chrome.contextMenus.create({
      id: "AI_TASKS_GROUP", // A new container ID
      title: "Cloud AI Tasks",
      contexts: ["selection"] // Only visible on selected text
    });

    // 3. Child menu items (require selection)
    chrome.contextMenus.create({ id: SUBMENU_SUMMARIZE_ID, parentId: "AI_TASKS_GROUP", title: "Summarize (Key Points)", contexts: ["selection"] });
    chrome.contextMenus.create({ id: SUBMENU_REWRITE_ID, parentId: "AI_TASKS_GROUP", title: "Rewrite: Simplify", contexts: ["selection"] });
    chrome.contextMenus.create({ id: SUBMENU_PROOFREAD_ID, parentId: "AI_TASKS_GROUP", title: "Proofread & Correct", contexts: ["selection"] });
    chrome.contextMenus.create({ id: SUBMENU_TRANSLATE_ID, parentId: "AI_TASKS_GROUP", title: "Translate to...", contexts: ["selection"] }); // NEW
    chrome.contextMenus.create({ id: SUBMENU_CUSTOM_PROMPT_ID, parentId: "AI_TASKS_GROUP", title: "Custom Prompt...", contexts: ["selection"] });
  });
});

// Listener for receiving the API key from the injected modal
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "saveApiKey") {
        GEMINI_API_KEY = request.apiKey;
        chrome.storage.local.set({ geminiApiKey: request.apiKey }, () => {
             console.log("Gemini API Key saved.");
        });
        // Remove API key modal after saving
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: () => document.getElementById('api-key-input-modal')?.remove()
        });
        return true; 
    }
});


// --- AI Execution and Routing ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Handle API Key setting action separately
    if (info.menuItemId === ACTION_SET_API_KEY) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showApiKeyModal
        });
        return;
    }

    const selectedText = info.selectionText;
    if (!selectedText || !tab.id || info.menuItemId === "AI_TASKS_GROUP") {
        return; 
    }
  
    if (!GEMINI_API_KEY) {
       injectResultModal(tab.id, "Configuration Required", "Please set your Gemini API key using the '⚙️ Set Gemini API Key...' menu option before running AI tasks.");
       return;
    }

    // AI Task execution logic begins here
    // Special handling for features that require pre-task input (Translate, Custom Prompt)
    if (info.menuItemId === SUBMENU_CUSTOM_PROMPT_ID) {
        hideProcessingModal(tab.id);
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showPromptModal,
            args: [selectedText]
        });
        return;
    }

    if (info.menuItemId === SUBMENU_TRANSLATE_ID) {
        hideProcessingModal(tab.id);
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showTranslationModal,
            args: [selectedText]
        });
        return;
    }
    
    // Run direct AI tasks
    runAiTask(info.menuItemId, selectedText, tab.id);
});

/**
 * Routes and executes the selected AI task.
 */
async function runAiTask(menuItemId, selectedText, tabId) {
  try {
    let result;
    let title;
    
    injectProcessingModal(tabId, "Querying Cloud AI...");
    
    switch (menuItemId) {
      case SUBMENU_SUMMARIZE_ID:
        result = await executeCloudAiTask(selectedText, "You are an expert summarizer. Provide the key points from the context as a short, concise, bulleted list using markdown format.");
        title = "AI Summary (Key Points)";
        break;

      case SUBMENU_REWRITE_ID:
        result = await executeCloudAiTask(selectedText, "Rewrite the following text to simplify it for a 5th-grade reading level. Keep the length similar.");
        title = "AI Rewrite (Simplified)";
        break;

      case SUBMENU_PROOFREAD_ID:
        result = await executeCloudAiTask(selectedText, "Proofread the text provided. First, output the fully corrected text. Second, list all significant changes made (grammar, spelling, syntax) in a bulleted list format.");
        title = "Proofread Corrections";
        break;
    }
    
    injectResultModal(tabId, title, result);

  } catch (error) {
    console.error(`AI Task Error for ${menuItemId}:`, error);
    const errorMessage = error.message || 'API request failed. Check your API key and connection.';
    injectResultModal(tabId, "Cloud AI Error", `Error: ${errorMessage}`);
  } finally {
    hideProcessingModal(tabId);
  }
}


/**
 * Executes a Cloud Gemini API task.
 */
async function executeCloudAiTask(text, systemPrompt) {
  const plainText = text.replace(/<[^>]*>?/gm, ''); 

  const payload = {
      contents: [{ parts: [{ text: `Original Text: ${plainText}` }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      // Use low temperature for focused tasks like summarization/rewriting/proofreading
      generationConfig: {
          temperature: 0.2
      }
  };

  const apiUrl = `${API_URL_BASE}${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  // Use exponential backoff for robustness
  for (let attempt = 0; attempt < 3; attempt++) {
      try {
          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`HTTP error ${response.status}: ${errorText}`);
          }

          const result = await response.json();
          const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

          if (generatedText) {
              return generatedText;
          } else {
              throw new Error("Received an empty or malformed response from the API.");
          }

      } catch (error) {
          if (attempt === 2) throw error; // Re-throw on final attempt
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
  }
  throw new Error("Maximum retry attempts reached.");
}

// --- Listener for Custom Prompt / Translate Result ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "runCustomPrompt" && sender.tab.id) {
        injectProcessingModal(sender.tab.id, "Running Custom Prompt...");
        
        executeCloudAiTask(request.selectedText, request.customPrompt)
            .then(result => {
                injectResultModal(sender.tab.id, "Custom Prompt Result", result);
                sendResponse({ status: "success" });
            })
            .catch(error => {
                injectResultModal(sender.tab.id, "Prompt Error", error.message);
                sendResponse({ status: "error", message: error.message });
            })
            .finally(() => {
                hideProcessingModal(sender.tab.id);
            });
        return true; 
    }

    // NEW: Handle Translate Request
    if (request.action === "runTranslation" && sender.tab.id) {
        injectProcessingModal(sender.tab.id, `Translating to ${request.targetLanguage}...`);

        const systemPrompt = `You are an expert translator. Translate the following text strictly into ${request.targetLanguage} and provide only the translated text as the output.`;
        
        executeCloudAiTask(request.selectedText, systemPrompt)
            .then(result => {
                injectResultModal(sender.tab.id, `Translation: ${request.targetLanguage}`, result);
                sendResponse({ status: "success" });
            })
            .catch(error => {
                injectResultModal(sender.tab.id, "Translation Error", error.message);
                sendResponse({ status: "error", message: error.message });
            })
            .finally(() => {
                hideProcessingModal(sender.tab.id);
            });
        return true;
    }
});


// --- Functions to be injected by chrome.scripting.executeScript (These run in the webpage's context) ---
// --- UI Helpers ---

function injectResultModal(tabId, title, content) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: displayResultModal,
        args: [title, content]
    });
}

function injectProcessingModal(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: showProcessingModal,
        args: [message]
    });
}

function hideProcessingModal(tabId) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
             const modal = document.getElementById('nano-processing-modal');
             if (modal) { modal.remove(); }
        }
    });
}


/**
 * Displays a non-blocking modal with the result from the AI.
 */
function displayResultModal(title, content) {
    let modal = document.getElementById('nano-adapt-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'nano-adapt-modal';
        modal.style.cssText = `
            position: fixed; top: 10%; right: 10px; z-index: 10000; 
            width: 380px; max-height: 85vh; overflow-y: auto; 
            background: #ffffff; border: 1px solid #1e3a8a; 
            box-shadow: 0 6px 15px rgba(0,0,0,0.4); border-radius: 10px; 
            font-family: 'Inter', sans-serif; transition: opacity 0.3s;
        `;
        document.body.appendChild(modal);
    }
    
    const htmlContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
        .replace(/^- (.*)/gm, '<li>$1</li>'); 
    
    const finalContent = htmlContent.startsWith('<li>') ? `<ul>${htmlContent}</ul>` : `<p>${htmlContent.replace(/\n\n/g, '</p><p>')}</p>`;

    modal.innerHTML = `
        <div style="padding: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; color: #1e3a8a; font-size: 1.1rem;">${title}</h3>
                <button onclick="document.getElementById('nano-adapt-modal').remove();" 
                        style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: bold; transition: background 0.2s;">
                    &times; Close
                </button>
            </div>
            <div style="font-size: 0.95rem; color: #333; max-height: 70vh; overflow-y: auto;">
              ${finalContent}
            </div>
        </div>
    `;

    modal.style.display = 'block';
    
    const processingModal = document.getElementById('nano-processing-modal');
    if (processingModal) {
        processingModal.remove();
    }
}

function showProcessingModal(message) {
    let modal = document.getElementById('nano-processing-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'nano-processing-modal';
        modal.style.cssText = `
            position: fixed; top: 10px; right: 10px; z-index: 10001; 
            padding: 10px 20px; background: #fbbf24; color: #333; 
            border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); 
            font-family: 'Inter', sans-serif; font-size: 0.9rem; font-weight: bold;
        `;
        document.body.appendChild(modal);
    }
    modal.textContent = message;
    modal.style.display = 'block';
}

/**
 * Injects the custom prompt input modal.
 */
function showPromptModal(selectedText) {
    let modal = document.getElementById('nano-prompt-input-modal');
    if (modal) { modal.remove(); }
    
    modal = document.createElement('div');
    modal.id = 'nano-prompt-input-modal';
    
    modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
        z-index: 10002; width: 450px; max-width: 90vw; background: #eef2ff; 
        border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); 
        padding: 25px; font-family: 'Inter', sans-serif; border: 3px solid #1e3a8a;
    `;

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #1e3a8a; border-bottom: 2px solid #bfdbfe; padding-bottom: 10px; font-size: 1.25rem;">Custom Cloud Prompt</h3>
        <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 10px;">
            <strong style="color: #1e3a8a;">Context Snippet:</strong>
            <span style="display: block; max-height: 50px; overflow-y: hidden; text-overflow: ellipsis; background: #ffffff; padding: 5px; border-radius: 6px; border: 1px solid #d1d5db;">
                ${selectedText.substring(0, 100)}...
            </span>
        </p>
        <textarea id="nano-custom-prompt-input" 
                  placeholder="e.g., 'Translate this to Spanish and make it sound formal' or 'Write a short headline for this.'"
                  style="width: 100%; height: 90px; padding: 12px; margin-bottom: 15px; border: 2px solid #9ca3af; border-radius: 8px; resize: vertical; box-sizing: border-box; font-size: 1rem;" autofocus></textarea>
        
        <div style="display: flex; justify-content: flex-end;">
            <button id="nano-prompt-cancel" 
                    style="margin-right: 10px; padding: 10px 18px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                Cancel
            </button>
            <button id="nano-prompt-submit" 
                    style="padding: 10px 18px; background: #1e3a8a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                Run Prompt
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('nano-prompt-cancel').onclick = () => { modal.remove(); };
    document.getElementById('nano-prompt-submit').onclick = () => {
        const inputElement = document.getElementById('nano-custom-prompt-input');
        const customPrompt = inputElement.value.trim();
        
        if (customPrompt) {
            chrome.runtime.sendMessage({ action: "runCustomPrompt", selectedText: selectedText, customPrompt: customPrompt });
            modal.remove();
        } else {
             alert("Please enter a custom instruction.");
        }
    };
}

/**
 * Injects the translation input modal. (NEW FUNCTION)
 */
function showTranslationModal(selectedText) {
    let modal = document.getElementById('translation-input-modal');
    if (modal) { modal.remove(); }
    
    modal = document.createElement('div');
    modal.id = 'translation-input-modal';
    
    modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
        z-index: 10002; width: 400px; max-width: 90vw; background: #e0f2f1; 
        border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); 
        padding: 25px; font-family: 'Inter', sans-serif; border: 3px solid #00796b;
    `;

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #00796b; border-bottom: 2px solid #b2dfdb; padding-bottom: 10px; font-size: 1.25rem;">Select Target Language</h3>
        <p style="font-size: 0.85rem; color: #4b5563; margin-bottom: 15px;">
            <strong style="color: #00796b;">Context Snippet:</strong>
            <span style="display: block; max-height: 50px; overflow-y: hidden; text-overflow: ellipsis; background: #ffffff; padding: 5px; border-radius: 6px; border: 1px solid #d1d5db;">
                ${selectedText.substring(0, 100)}...
            </span>
        </p>
        
        <input type="text" id="target-language-input" 
               placeholder="e.g., Spanish, French, Japanese (formal)"
               value="Spanish"
               style="width: 100%; padding: 12px; margin-bottom: 15px; border: 2px solid #9ca3af; border-radius: 8px; box-sizing: border-box; font-size: 1rem;" autofocus>
        
        <div style="display: flex; justify-content: flex-end;">
            <button id="translate-cancel" 
                    style="margin-right: 10px; padding: 10px 18px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                Cancel
            </button>
            <button id="translate-submit" 
                    style="padding: 10px 18px; background: #00796b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                Translate
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('translate-cancel').onclick = () => { modal.remove(); };
    document.getElementById('translate-submit').onclick = () => {
        const inputElement = document.getElementById('target-language-input');
        const targetLanguage = inputElement.value.trim();
        
        if (targetLanguage) {
            chrome.runtime.sendMessage({ 
                action: "runTranslation", 
                selectedText: selectedText, 
                targetLanguage: targetLanguage 
            });
            modal.remove();
        } else {
             alert("Please enter a target language."); 
        }
    };
}


function showApiKeyModal() {
    let modal = document.getElementById('api-key-input-modal');
    if (modal) { modal.remove(); }
    
    modal = document.createElement('div');
    modal.id = 'api-key-input-modal';
    
    modal.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
        z-index: 10003; width: 400px; max-width: 90vw; background: #fff; 
        border-radius: 16px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); 
        padding: 25px; font-family: 'Inter', sans-serif; border: 3px solid #f97316;
    `;

    modal.innerHTML = `
        <h3 style="margin-top: 0; color: #f97316; border-bottom: 2px solid #fec793; padding-bottom: 10px; font-size: 1.25rem;">API Key Setup (Cloud Model)</h3>
        <p style="font-size: 0.9rem; color: #333; margin-bottom: 15px;">
            Enter your Gemini API Key to enable cloud-based AI processing.
        </p>
        <input type="text" id="gemini-api-key-input" 
               placeholder="Enter your API Key here"
               style="width: 100%; padding: 12px; margin-bottom: 15px; border: 2px solid #d1d5db; border-radius: 8px; box-sizing: border-box; font-size: 1rem;">
        
        <div style="display: flex; justify-content: flex-end;">
            <button id="api-key-save" 
                    style="padding: 10px 18px; background: #1e3a8a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s;">
                Save Key
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('api-key-save').onclick = () => {
        const inputElement = document.getElementById('gemini-api-key-input');
        const apiKey = inputElement.value.trim();
        
        if (apiKey) {
            chrome.runtime.sendMessage({ action: "saveApiKey", apiKey: apiKey });
        } else {
             alert("The API Key cannot be empty.");
        }
    };
}
