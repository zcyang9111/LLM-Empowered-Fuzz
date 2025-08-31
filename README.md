# LLM-Empowered-Fuzz
This project is the **first-ever website** that integrates a **fuzzing tool (Echidna)** with a **Large Language Model (LLM)** to analyse smart contracts.  
Users can upload their Solidity smart contracts and related Echidna property files, run automated fuzzing and LLM-based analysis, and download results in **PDF** or **JSON** format.

This platform is designed to simplify the process of smart contract auditing for both **beginners** and **experts**.
## Features

- **Smart Contract Upload**: Upload Solidity contracts and Echidna property files for analysis.
- **Real-Time Fuzzing & LLM Analysis**: 
  - Echidna fuzzes the uploaded contracts.
  - LLM generates context-aware vulnerability checks and recommendations.
- **Severity Categorization**: Vulnerabilities displayed as:
  - 🔴 High
  - 🟡 Medium
  - 🟢 Low
- **Actionable Recommendations**: AI-powered suggestions for fixing code issues.
- **Detailed Reports**:
  - Code coverage and execution statistics from Echidna.
  - Raw fuzzing output.
  - Downloadable reports in **PDF** and **JSON** format.
- **User-Friendly UI**:
  - Upload progress bar.
  - Visual severity indicators.
  - Interactive results pages.
## User Manual (MacOS)
1. **Download** the repository.  
2. **Install Echidna** on your system.  
3. Navigate to the project directory and install frontend dependencies:  
   ```bash
   cd project-directory
   npm install
   ```
4. Navigate to the backend folder and install backend dependencies:  
   ```bash
   cd back-end
   npm install
   ```
5. Create a `Property` directory in your home folder:  
   ```bash
   mkdir ~/Property
   ```
6. Place your smart contracts and related Echidna property files into the `~/Property` folder.  
7. Set your **ChatGPT API key** as an environment variable:  
   ```bash
   export OPENAI_API_KEY="your_api_key_here"
   ```
   > 💡 Tip: Add this line to your `~/.bashrc` or `~/.zshrc` to make it persistent.  
8. Start the backend server:  
   ```bash
   npm start
   ```
9. In another terminal, start the frontend:  
   ```bash
   npm run dev
   ```
10. Open your browser and go to the provided URL to access the platform.  

## Screenshots
<img width="1352" height="878" alt="Image" src="https://github.com/user-attachments/assets/f9763a67-22b6-4efc-8a8a-43676e911e63" />

<img width="1352" height="878" alt="Image" src="https://github.com/user-attachments/assets/9b6c485b-3826-46d2-a081-0e4ec9cb733f" />

<img width="1352" height="878" alt="Image" src="https://github.com/user-attachments/assets/6d1094ff-5595-4edd-bc2e-8fd1f8e44638" />

<img width="1352" height="878" alt="Image" src="https://github.com/user-attachments/assets/863e5140-37b1-4852-aa73-7a5f6296cd93" />

<img width="1352" height="878" alt="Image" src="https://github.com/user-attachments/assets/d85b7f7c-6a0d-49aa-86c7-bb2e7150ba9f" />

<img width="1043" height="590" alt="Image" src="https://github.com/user-attachments/assets/7c455e61-e1a2-4b6f-b685-6413d3dc7a9a" />
