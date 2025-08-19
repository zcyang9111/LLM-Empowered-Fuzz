const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const PDFDocument = require('pdfkit');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 5001;
const KEEP_FILES = process.env.KEEP_FILES !== 'false';



// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(os.tmpdir(), 'echidna-uploads');
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) !== '.sol') {
      return cb(new Error('Only .sol files are allowed'));
    }
    cb(null, true);
  }
});

// GPT-4 Analysis endpoint
app.post('/api/analyze-gpt', async (req, res) => {
  try {
    const { contractContent, propertyContent, contractName, echidnaResults } = req.body;

    if (!contractContent || !contractName) {
      return res.status(400).json({ error: 'Contract content and name are required' });
    }

    // Prepare the prompt for GPT-4
    const prompt = `
    Analyze the following Solidity smart contract for security vulnerabilities.

    Contract Name: ${contractName}
    
    Original Contract Code:
    \`\`\`solidity
    ${contractContent}
    \`\`\`
    
    ${propertyContent ? `Property File (Echidna Tests):
    \`\`\`solidity
    ${propertyContent}
    \`\`\`` : ''}
    
    ${echidnaResults ? `Echidna Fuzzing Results:
    ${echidnaResults}` : ''}
    
    Please provide a comprehensive security analysis with the following structure:
    
    1. Overall Severity Assessment (High/Medium/Low) based on the vulnerabilities found in the original contract
    2. List of Identified Vulnerabilities in the original contract with:
       - Vulnerability Type (e.g., Reentrancy, Integer Overflow, Access Control, etc.)
       - Severity (High/Medium/Low)
       - Description
       - Location in code (function/line if identifiable)
    3. Analysis of the property tests (if provided) and whether they adequately test for the identified vulnerabilities
    4. Detailed Recommendations for fixing each vulnerability
    5. Code fixes/improvements where applicable
    
    Format your response as a JSON object with the following structure:
    {
      "overallSeverity": "High/Medium/Low",
      "vulnerabilities": [
        {
          "type": "Vulnerability Type",
          "severity": "High/Medium/Low",
          "description": "Description of the vulnerability",
          "location": "Function name or line"
        }
      ],
      "propertyTestAnalysis": "Analysis of whether the Echidna tests cover the vulnerabilities",
      "recommendations": [
        "Recommendation 1",
        "Recommendation 2"
      ],
      "codeFixes": [
        {
          "issue": "Issue description",
          "fix": "Code fix"
        }
      ]
    }
    
    IMPORTANT: Respond ONLY with the JSON object, no additional text or markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14", // Use the latest GPT-4 model
      messages: [
        {
          role: "system",
          content: "You are a senior smart contract security auditor with expertise in Solidity and blockchain security. You also understand Echidna property-based testing. Analyze contracts thoroughly for vulnerabilities and provide actionable recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const responseText = completion.choices[0].message.content;
    
    // Parse the JSON response
    let analysis;
    try {
      // Clean the response if it contains markdown code blocks
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse GPT response:', responseText);
      // Fallback: try to extract meaningful information
      analysis = {
        overallSeverity: "Medium",
        vulnerabilities: [{
          type: "Analysis Parse Error",
          severity: "Low",
          description: "GPT response could not be parsed properly. Raw analysis available in recommendations.",
          location: "N/A"
        }],
        propertyTestAnalysis: "Unable to analyze property tests due to parsing error.",
        recommendations: [responseText],
        codeFixes: []
      };
    }

    res.json(analysis);
  } catch (error) {
    console.error('GPT analysis error:', error);
    res.status(500).json({ 
      error: 'GPT analysis failed', 
      details: error.message 
    });
  }
});

// PDF Export endpoint
app.post('/api/export-pdf', async (req, res) => {
  try {
    const { contractName, echidnaResults, gptAnalysis, contractFileName, propertyFileName } = req.body;

    // Create a new PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${contractName}_analysis.pdf"`);
    
    // Pipe the PDF to the response
    doc.pipe(res);

    // Add content to PDF
    doc.fontSize(24).text('Smart Contract Security Analysis Report', { align: 'center' });
    doc.moveDown();
    
    // Contract Information
    doc.fontSize(16).text('Contract Information', { underline: true });
    doc.fontSize(12);
    doc.text(`Contract Name: ${contractName}`);
    doc.text(`Original Contract File: ${contractFileName}`);
    doc.text(`Property File: ${propertyFileName}`);
    doc.text(`Analysis Date: ${new Date().toLocaleString()}`);
    doc.moveDown();

    // GPT-4 Analysis Section
    if (gptAnalysis) {
      doc.fontSize(16).text('Security Analysis', { underline: true });
      doc.moveDown(0.5);
      
      // Overall Severity
      doc.fontSize(14).text(`Overall Severity: ${gptAnalysis.overallSeverity || 'N/A'}`, {
        continued: false
      });
      doc.moveDown();

      // Vulnerabilities
      if (gptAnalysis.vulnerabilities && gptAnalysis.vulnerabilities.length > 0) {
        doc.fontSize(14).text('Identified Vulnerabilities:', { underline: true });
        doc.fontSize(11);
        
        gptAnalysis.vulnerabilities.forEach((vuln, index) => {
          doc.moveDown(0.5);
          doc.fillColor('#000000').text(`${index + 1}. ${vuln.type}`, { bold: true });
          doc.fillColor('#666666');
          doc.text(`   Severity: ${vuln.severity}`);
          doc.text(`   Description: ${vuln.description}`);
          if (vuln.location) {
            doc.text(`   Location: ${vuln.location}`);
          }
        });
        doc.fillColor('#000000');
      }
      doc.moveDown();

      // Recommendations
      if (gptAnalysis.recommendations && gptAnalysis.recommendations.length > 0) {
        doc.fontSize(14).text('Recommendations:', { underline: true });
        doc.fontSize(11);
        
        gptAnalysis.recommendations.forEach((rec, index) => {
          doc.moveDown(0.5);
          doc.text(`${index + 1}. ${rec}`, {
            indent: 20,
            align: 'left'
          });
        });
      }
      doc.moveDown();

      // Code Fixes
      if (gptAnalysis.codeFixes && gptAnalysis.codeFixes.length > 0) {
        doc.fontSize(14).text('Suggested Code Fixes:', { underline: true });
        doc.fontSize(10);
        
        gptAnalysis.codeFixes.forEach((fix, index) => {
          doc.moveDown(0.5);
          doc.fontSize(11).text(`Issue ${index + 1}: ${fix.issue}`);
          doc.fontSize(9).font('Courier');
          
          // Add code fix in a box
          const fixLines = fix.fix.split('\n');
          fixLines.forEach(line => {
            doc.text(line, { indent: 20 });
          });
          doc.font('Helvetica');
        });
      }
    }

    // Echidna Results Section
    if (echidnaResults) {
      doc.addPage();
      doc.fontSize(16).text('Echidna Fuzzing Results', { underline: true });
      doc.moveDown();
      
      if (echidnaResults.output) {
        // Parse basic stats from output
        const testMatch = echidnaResults.output.match(/tests:\s*(\d+)\/(\d+)/);
        const coverageMatch = echidnaResults.output.match(/cov:\s*(\d+)/);
        
        if (testMatch) {
          doc.fontSize(12).text(`Tests Executed: ${testMatch[1]} / ${testMatch[2]}`);
        }
        if (coverageMatch) {
          doc.text(`Coverage: ${coverageMatch[1]}`);
        }
        
        doc.moveDown();
        doc.fontSize(11).text('Raw Output:', { underline: true });
        doc.fontSize(9).font('Courier');
        
        // Add truncated output (first 100 lines)
        const outputLines = echidnaResults.output.split('\n').slice(0, 100);
        outputLines.forEach(line => {
          if (line.length > 80) {
            // Wrap long lines
            const chunks = line.match(/.{1,80}/g) || [];
            chunks.forEach(chunk => doc.text(chunk));
          } else {
            doc.text(line);
          }
        });
        
        if (echidnaResults.output.split('\n').length > 100) {
          doc.text('... (output truncated)');
        }
      }
    }

    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ 
      error: 'PDF export failed', 
      details: error.message 
    });
  }
});

// Main Echidna analysis endpoint
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const contractName = req.body.contractName;
    if (!contractName) {
      return res.status(400).json({ error: 'Contract name is required' });
    }

    const filePath = req.file.path;
    const fileName = req.file.filename;
    
    const propertyDir = path.join(process.env.HOME || process.env.USERPROFILE, 'Property');
    
    const targetPath = path.join(propertyDir, fileName);
    await fs.copyFile(filePath, targetPath);

    const echidnaPath = process.env.ECHIDNA_PATH || 'echidna';
    const command = `cd "${propertyDir}" && "${echidnaPath}" "${fileName}" --contract "${contractName}"`;
    
    console.log(`Executing: ${command}`);

    exec(command, { 
      maxBuffer: 10 * 1024 * 1024,
      shell: true
    }, async (error, stdout, stderr) => {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Cleanup error:', err);
      }

      if (error) {
        console.error('Echidna error:', error);
        console.error('Stdout:', stdout);
        console.error('Stderr:', stderr);
        
        if (stderr && stderr.includes('command not found')) {
          return res.status(500).json({ 
            error: 'Echidna not found',
            details: 'Echidna is not installed or not in PATH. Please install Echidna first.',
            installGuide: 'https://github.com/crytic/echidna#installation'
          });
        }
        
        if (stdout || stderr) {
          const fullOutput = (stdout || '') + (stderr ? '\n' + stderr : '');
          
          return res.json({
            success: true,
            output: fullOutput,
            executionTime: ((Date.now() - startTime) / 1000).toFixed(2) + 's',
            fileName: fileName,
            contractName: contractName,
            filePath: targetPath,
            exitCode: error.code,
            hasFailedTests: error.code === 1
          });
        }
        
        return res.status(500).json({ 
          error: 'Echidna execution failed',
          details: stderr || error.message,
          output: stdout,
          command: command,
          filePath: targetPath
        });
      }

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(2) + 's';
      const fullOutput = (stdout || '') + (stderr ? '\n' + stderr : '');

      try {
        await fs.unlink(filePath);
        
        if (!KEEP_FILES) {
          await fs.unlink(targetPath);
          console.log(`Removed ${fileName} from Property directory`);
        } else {
          console.log(`Kept ${fileName} in Property directory at: ${targetPath}`);
        }
      } catch (err) {
        console.error('Cleanup error:', err);
      }

      res.json({
        success: true,
        output: fullOutput,
        executionTime: executionTime,
        fileName: fileName,
        contractName: contractName,
        filePath: targetPath,
        stdout: stdout,
        stderr: stderr
      });
    });

  } catch (error) {
    console.error('Server error:', error);
    
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    }
    
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Echidna Analysis Server with GPT-4',
    propertyDir: path.join(process.env.HOME || process.env.USERPROFILE, 'Property'),
    keepFiles: KEEP_FILES,
    gptEnabled: !!process.env.OPENAI_API_KEY
  });
});

// List files in Property directory
app.get('/api/files', async (req, res) => {
  try {
    const propertyDir = path.join(process.env.HOME || process.env.USERPROFILE, 'Property');
    const files = await fs.readdir(propertyDir);
    const solFiles = files.filter(f => f.endsWith('.sol'));
    
    const fileStats = await Promise.all(
      solFiles.map(async (file) => {
        const filePath = path.join(propertyDir, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime
        };
      })
    );
    
    res.json({
      directory: propertyDir,
      files: fileStats
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to list files', 
      details: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Echidna backend server with GPT-4 integration running on port ${PORT}`);
  console.log(`Property directory: ${path.join(process.env.HOME || process.env.USERPROFILE, 'Property')}`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not set! GPT-4 analysis will not work.');
    console.warn('Set your OpenAI API key: export OPENAI_API_KEY="your-api-key"');
  } else {
    console.log('✅ OpenAI API key configured');
  }
  
  exec('echidna --version', (error, stdout, stderr) => {
    if (error) {
      console.warn('⚠️  WARNING: Echidna not found in PATH!');
      console.warn('Please install Echidna: https://github.com/crytic/echidna#installation');
    } else {
      console.log('✅ Echidna found:', stdout.trim());
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
  });
});