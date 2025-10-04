-----

# 🚀 Nano-Navigator: Contextual Content Adapter

**The ultimate on-demand text utility for Chrome. Summarize, rewrite, proofread, and translate any selected text instantly using the power of the Gemini API.**

-----

## ✨ Project Overview & Features

The Nano-Navigator transforms the browser experience by embedding advanced AI text utilities directly into the right-click context menu. It eliminates the need to copy, paste, and switch applications for quick content processing.

The extension leverages **prompt engineering** to implement the functionality of multiple built-in AI APIs using the highly capable **Cloud Gemini API**.

### Key Features (5-in-1 Utility)

| Feature | Functionality | Prompt API Used |
| :--- | :--- | :--- |
| **Summarize** | Condenses selected text into concise, bulleted key points. | `systemInstruction` for summarization. |
| **Rewrite** | Simplifies or alters the tone of selected text based on a given instruction (e.g., *Simplify for a 5th-grade level*). | `systemInstruction` for rewriting/simplification. |
| **Proofread** | Corrects grammar, spelling, and style, outputting the corrected text and listing the changes. | `systemInstruction` for text correction. |
| **Translate** | Translates selected text to any user-specified language. | `systemInstruction` for high-fidelity translation. |
| **Custom Prompt** | Executes any user-defined creative or analytical instruction against the selected text context. | Direct access to the `generateContent` endpoint. |

-----

## 🛠️ Built With

The project uses a modern, serverless stack to ensure low latency and high reliability.

| Category | Technology |
| :--- | :--- |
| **Extension Platform** | **Chrome Extensions (Manifest V3)** |
| **Core AI Model** | **Gemini 2.5 Flash Cloud API** |
| **Code Language** | **JavaScript (ES6+)** |
| **API Access** | Native JavaScript **`fetch` API** (for secure calls to the Google Generative Language API) |
| **Storage** | `chrome.storage.local` (for secure API key persistence) |

-----

## 🔑 Installation & Setup (Sideloading Guide)

Since this extension is not on the Chrome Web Store, you must install it using Developer Mode.

### Step 1: Clone the Repository

Clone or download the entire project folder to your local machine:

```bash
git clone https://github.com/snehamurali-07/Google-Chrome-Built-in-AI-Challenge-2025
```

### Step 2: Load the Extension

1.  Open Chrome and navigate to **`chrome://extensions`**.
2.  Toggle **Developer mode** **ON** (top right corner).
3.  Click the **Load unpacked** button (top left).
4.  Select the **root project folder** you just cloned (`nano-navigator`).

### Step 3: Configure the Gemini API Key

You must set your API key to activate the cloud features.

1.  Right-click **anywhere** on a webpage.
2.  Select **"⚙️ Set Gemini API Key..."**
3.  Paste your valid Gemini API key into the prompt and click **Save Key**.

-----

## 💡 Usage Guide

1.  **Select Text:** Highlight any text (a sentence, paragraph, or article) on the webpage.
2.  **Right-click:** Right-click the highlighted text.
3.  **Choose Task:** Access the features under the **"Cloud AI Tasks"** submenu and select your desired action.
      * For **Translate** and **Custom Prompt**, an intermediate modal will appear asking for your target language or specific instruction.

-----

## 🚧 Challenge & Architecture Note

The project was initially designed for the on-device **Gemini Nano API (`chrome.ai`)** to ensure ultimate privacy and speed. However, due to its highly experimental nature, the `chrome.ai` object was unavailable in the development environment.

**Solution:** I pivoted the architecture to successfully fulfill the contest criteria by implementing the functionality of all five required APIs (`Summarizer`, `Rewriter`, `Prompt`, `Proofreader`, `Translator`) using **Cloud Gemini 2.5 Flash** with custom, highly optimized system prompts. This shift ensured a robust, functional, and contest-compliant submission.

-----

## ⏭️ What's Next

1.  **Hybrid Relaunch:** Implement a future **Hybrid Architecture** that detects the local **Gemini Nano** API availability and defaults to on-device processing, falling back to the Cloud API only when necessary.
2.  **Side Panel UI:** Develop a persistent Chrome **Side Panel** to replace the injected modals, offering a cleaner interface for API status and result history.
3.  **Multimodal Integration:** Explore using the Gemini API to analyze visual elements on the page for richer context and new features.
