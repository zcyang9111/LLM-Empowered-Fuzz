import React, { useState, useRef } from 'react';
import { Download, FileText, AlertTriangle, Shield, Code, CheckCircle, XCircle, FileCode, FileSearch, CircleAlert } from 'lucide-react';

const LLMFuzzing = () => {
  const [isDragActive, setIsDragActive] = useState({ contract: false, property: false });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzingWithGPT, setIsAnalyzingWithGPT] = useState(false);
  const [contractFile, setContractFile] = useState(null);
  const [propertyFile, setPropertyFile] = useState(null);
  const [contractName, setContractName] = useState('');
  const [contractContent, setContractContent] = useState('');
  const [propertyContent, setPropertyContent] = useState('');
  const [echidnaResults, setEchidnaResults] = useState(null);
  const [gptAnalysis, setGptAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const contractInputRef = useRef(null);
  const propertyInputRef = useRef(null);

  const preventDefaults = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (type) => (e) => {
    preventDefaults(e);
    setIsDragActive(prev => ({ ...prev, [type]: true }));
  };

  const handleDragLeave = (type) => (e) => {
    preventDefaults(e);
    setIsDragActive(prev => ({ ...prev, [type]: false }));
  };

  const handleDragOver = (type) => (e) => {
    preventDefaults(e);
    setIsDragActive(prev => ({ ...prev, [type]: true }));
  };

  const handleDrop = (type) => (e) => {
    preventDefaults(e);
    setIsDragActive(prev => ({ ...prev, [type]: false }));

    const files = e.dataTransfer.files;
    if (type === 'contract') {
      handleContractFiles(files);
    } else {
      handlePropertyFiles(files);
    }
  };

  const handleContractFileSelect = (e) => {
    const files = e.target.files;
    handleContractFiles(files);
  };

  const handlePropertyFileSelect = (e) => {
    const files = e.target.files;
    handlePropertyFiles(files);
  };

  const handleContractFiles = (files) => {
    if (files.length) {
      const file = files[0];
      if (file.name.endsWith('.sol')) {
        setContractFile(file);
        setError(null);
        extractContractInfo(file);
      } else {
        setError('Please select a Solidity file with the .sol extension for the contract.');
      }
    }
  };

  const handlePropertyFiles = (files) => {
    if (files.length) {
      const file = files[0];
      if (file.name.endsWith('.sol')) {
        setPropertyFile(file);
        setError(null);
        extractPropertyInfo(file);
      } else {
        setError('Please select a Solidity file with the .sol extension for the property.');
      }
    }
  };

  const extractContractInfo = async (file) => {
    const text = await file.text();
    setContractContent(text);
  };

  const extractPropertyInfo = async (file) => {
    const text = await file.text();
    setPropertyContent(text);
    const contractMatch = text.match(/contract\s+(\w+)/);
    if (contractMatch) {
      setContractName(contractMatch[1]);
    }
  };

  const runAnalysis = async () => {
    if (!contractFile || !propertyFile || !contractName) {
      setError('Please upload both contract and property files, and ensure a contract name is specified.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', propertyFile);
    formData.append('contractName', contractName);

    try {
      const response = await fetch('http://localhost:5001/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok || data.output) {
        setEchidnaResults(data);
        await runGPTAnalysis(data);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (err) {
      setError('Failed to connect to the server. Make sure the backend is running.');
    } finally {
      setIsProcessing(false);
    }
  };

  const runGPTAnalysis = async (echidnaData) => {
    setIsAnalyzingWithGPT(true);
    
    try {
      const response = await fetch('http://localhost:5001/api/analyze-gpt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractContent: contractContent,
          propertyContent: propertyContent,
          contractName: contractName,
          echidnaResults: echidnaData?.output || '',
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setGptAnalysis(data);
      } else {
        console.error('GPT analysis failed:', data.error);
      }
    } catch (err) {
      console.error('Failed to run GPT analysis:', err);
    } finally {
      setIsAnalyzingWithGPT(false);
    }
  };

  const downloadPDF = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractName: contractName,
          echidnaResults: echidnaResults,
          gptAnalysis: gptAnalysis,
          contractFileName: contractFile?.name,
          propertyFileName: propertyFile?.name,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${contractName}_analysis.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download PDF:', err);
    }
  };

  const downloadJSON = () => {
    const analysisData = {
      contractName: contractName,
      contractFileName: contractFile?.name,
      propertyFileName: propertyFile?.name,
      timestamp: new Date().toISOString(),
      echidnaResults: echidnaResults,
      gptAnalysis: gptAnalysis,
    };

    const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contractName}_analysis.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const parseResults = (output) => {
    if (!output) return null;

    const testMatch = output.match(/tests:\s*(\d+)\/(\d+)/);
    const failedMatch = output.match(/(\w+):\s*failed!/);
    const falsifiedMatch = output.match(/Test\s+(\w+)\s+falsified!/);
    const callSequenceMatch = output.match(/Call sequence:([\s\S]*?)(?=Traces:|Unique|$)/);
    
    const coverageMatch = output.match(/cov:\s*(\d+)/);
    const corpusMatch = output.match(/corpus:\s*(\d+)/);
    const uniqueInstrMatch = output.match(/Unique instructions:\s*(\d+)/);
    const totalCallsMatch = output.match(/Total calls:\s*(\d+)/);
    
    let callSequence = null;
    if (callSequenceMatch) {
      callSequence = callSequenceMatch[1].trim();
    } else {
      const callSeqStart = output.indexOf('Call sequence:');
      if (callSeqStart !== -1) {
        const callSeqEnd = output.indexOf('\n\n', callSeqStart);
        if (callSeqEnd !== -1) {
          callSequence = output.substring(callSeqStart + 'Call sequence:'.length, callSeqEnd).trim();
        }
      }
    }

    return {
      testResults: {
        total: testMatch ? parseInt(testMatch[2]) : 0,
        executed: testMatch ? parseInt(testMatch[1]) : 0,
        failed: failedMatch || falsifiedMatch ? 1 : 0,
        failedTest: failedMatch ? failedMatch[1] : (falsifiedMatch ? falsifiedMatch[1] : null),
        callSequence: callSequence
      },
      coverage: {
        instructions: uniqueInstrMatch ? parseInt(uniqueInstrMatch[1]) : 0,
        coverage: coverageMatch ? parseInt(coverageMatch[1]) : 0,
        corpusSize: corpusMatch ? parseInt(corpusMatch[1]) : 0,
        totalCalls: totalCallsMatch ? parseInt(totalCallsMatch[1]) : 0
      }
    };
  };

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return 'text-red-600 bg-gradient-to-r from-red-50 to-red-100 border-red-300 shadow-red-200/50';
      case 'medium':
        return 'text-amber-700 bg-gradient-to-r from-amber-50 to-yellow-100 border-amber-300 shadow-amber-200/50';
      case 'low':
        return 'text-emerald-700 bg-gradient-to-r from-emerald-50 to-green-100 border-emerald-300 shadow-emerald-200/50';
      default:
        return 'text-slate-600 bg-gradient-to-r from-slate-50 to-gray-100 border-slate-300 shadow-slate-200/50';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return <CircleAlert className="w-5 h-5 animate-pulse" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5" />;
      case 'low':
        return <Shield className="w-5 h-5" />;
      default:
        return <Code className="w-5 h-5" />;
    }
  };

  const renderUploadSection = () => (
    <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-5xl p-10 border border-gray-100">
      <h2 className="text-3xl mb-8 text-transparent bg-clip-text bg-gradient-to-r from-gray-800 to-gray-600 text-center font-bold">
        Upload Smart Contract Files
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Original Contract Upload */}
        <div className="transform transition-all duration-300 hover:scale-[1.02]">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <FileCode className="w-5 h-5" />
            </div>
            <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
              Original Contract
            </span>
          </h3>
          <div
            className={`relative border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 overflow-hidden group ${
              isDragActive.contract
                ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-blue-100 scale-[1.02]'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-blue-100/50'
            }`}
            onDragEnter={handleDragEnter('contract')}
            onDragLeave={handleDragLeave('contract')}
            onDragOver={handleDragOver('contract')}
            onDrop={handleDrop('contract')}
            onClick={() => contractInputRef.current?.click()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="text-center relative z-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileCode className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Drop original contract here
              </p>
              <p className="text-xs text-gray-500">
                (For analysis)
              </p>
            </div>
            <input
              ref={contractInputRef}
              type="file"
              accept=".sol"
              onChange={handleContractFileSelect}
              className="hidden"
            />
          </div>
          {contractFile && (
            <div className="mt-3 text-sm text-emerald-600 flex items-center gap-2 p-2 bg-emerald-50 rounded-lg animate-fadeIn">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">{contractFile.name}</span>
            </div>
          )}
        </div>

        {/* Property File Upload */}
        <div className="transform transition-all duration-300 hover:scale-[1.02]">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <FileSearch className="w-5 h-5" />
            </div>
            <span className="bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
              Property File
            </span>
          </h3>
          <div
            className={`relative border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 overflow-hidden group ${
              isDragActive.property
                ? 'border-purple-400 bg-gradient-to-br from-purple-50 to-purple-100 scale-[1.02]'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gradient-to-br hover:from-purple-50/50 hover:to-purple-100/50'
            }`}
            onDragEnter={handleDragEnter('property')}
            onDragLeave={handleDragLeave('property')}
            onDragOver={handleDragOver('property')}
            onDrop={handleDrop('property')}
            onClick={() => propertyInputRef.current?.click()}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="text-center relative z-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileSearch className="w-8 h-8 text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Drop property file here
              </p>
              <p className="text-xs text-gray-500">
                (For Echidna testing)
              </p>
            </div>
            <input
              ref={propertyInputRef}
              type="file"
              accept=".sol"
              onChange={handlePropertyFileSelect}
              className="hidden"
            />
          </div>
          {propertyFile && (
            <div className="mt-3 text-sm text-emerald-600 flex items-center gap-2 p-2 bg-emerald-50 rounded-lg animate-fadeIn">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">{propertyFile.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contract Name Input and Run Button */}
      {contractFile && propertyFile && (
        <div className="border-t border-gray-200 pt-6 animate-slideUp">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Property Contract Name
              </label>
              <input
                type="text"
                value={contractName}
                onChange={(e) => setContractName(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                placeholder="Enter the contract name from property file"
              />
              <p className="text-xs text-gray-500 mt-2">
                This should match the contract name in your property file that Echidna will test
              </p>
            </div>
            <button
              onClick={runAnalysis}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl mt-6 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!contractName}
            >
              Run Analysis
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-inner">
        <h4 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">i</div>
          How it works:
        </h4>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span><strong className="font-semibold">Original Contract:</strong> Your main smart contract code for vulnerability analysis</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-0.5">•</span>
            <span><strong className="font-semibold">Property File:</strong> Contract with Echidna test properties for fuzzing</span>
          </li>
        </ul>
      </div>

      {error && (
        <div className="mt-6 bg-gradient-to-r from-red-50 to-pink-50 border border-red-300 text-red-800 px-6 py-4 rounded-xl flex items-start gap-3 animate-shake">
          <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
    </div>
  );

  const renderProcessingSection = () => (
    <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl p-12 text-center border border-gray-100">
      <h2 className="text-3xl mb-8 font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
        {isAnalyzingWithGPT ? 'Running Security Analysis' : 'Running Echidna Fuzzing'}
      </h2>

      <div className="flex flex-col items-center">
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-spin"></div>
          <div className="absolute inset-2 bg-white rounded-full"></div>
          <div className="absolute inset-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse"></div>
        </div>

        <p className="text-gray-700 mb-3 font-medium">
          {isAnalyzingWithGPT ? 'Analyzing Original Contract:' : 'Testing Property File:'}
        </p>
        <p className="text-sm font-bold text-gray-900 bg-gray-100 px-4 py-2 rounded-lg">
          {isAnalyzingWithGPT ? contractFile?.name : propertyFile?.name}
        </p>
        <p className="text-sm text-gray-600 mt-3">Contract: <span className="font-semibold">{contractName}</span></p>
        <p className="text-sm text-gray-500 mt-3 max-w-md">
          {isAnalyzingWithGPT 
            ? 'Analyzing vulnerabilities and generating recommendations...' 
            : 'Echidna is running property-based tests...'}
        </p>

        <div className="mt-8 w-full max-w-md">
          <div className="bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full animate-progress shadow-lg" 
                 style={{ width: isAnalyzingWithGPT ? '90%' : '50%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderResultsSection = () => {
    const parsedResults = parseResults(echidnaResults?.output);
    
    return (
      <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-7xl p-10 border border-gray-100">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Smart Contract Analysis Results
          </h2>
          <div className="flex gap-3">
            <button
              onClick={downloadPDF}
              className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <FileText className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={downloadJSON}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
            <button
              onClick={() => {
                setContractFile(null);
                setPropertyFile(null);
                setEchidnaResults(null);
                setGptAnalysis(null);
                setContractName('');
                setContractContent('');
                setPropertyContent('');
                setError(null);
              }}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              New Analysis
            </button>
          </div>
        </div>

        {/* File Information */}
        <div className="mb-8 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
          <h3 className="font-bold mb-3 text-gray-800">Analysis Files:</h3>
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div className="flex items-center gap-3">
              <FileCode className="w-5 h-5 text-blue-500" />
              <span className="text-gray-600">Original Contract:</span>
              <span className="font-mono font-semibold text-gray-900">{contractFile?.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <FileSearch className="w-5 h-5 text-purple-500" />
              <span className="text-gray-600">Property File:</span>
              <span className="font-mono font-semibold text-gray-900">{propertyFile?.name}</span>
            </div>
          </div>
        </div>

        {/* GPT-4 Security Analysis */}
        {gptAnalysis && (
          <div className="mb-8 space-y-6">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
                <Shield className="w-6 h-6" />
              </div>
              <span className="bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                Security Analysis (Original Contract)
              </span>
            </h3>

            {/* Overall Severity */}
            {gptAnalysis.overallSeverity && (
              <div className={`border-2 rounded-xl p-6 shadow-lg ${getSeverityColor(gptAnalysis.overallSeverity)}`}>
                <div className="flex items-center gap-3">
                  {getSeverityIcon(gptAnalysis.overallSeverity)}
                  <span className="font-bold text-lg">Overall Severity: {gptAnalysis.overallSeverity}</span>
                </div>
              </div>
            )}

            {/* Vulnerabilities */}
            {gptAnalysis.vulnerabilities && gptAnalysis.vulnerabilities.length > 0 && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                <h4 className="font-bold mb-4 text-gray-800">Identified Vulnerabilities:</h4>
                <div className="space-y-4">
                  {gptAnalysis.vulnerabilities.map((vuln, index) => (
                    <div key={index} className={`border-2 rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow duration-300 ${getSeverityColor(vuln.severity)}`}>
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(vuln.severity)}
                        <div className="flex-1">
                          <div className="font-bold text-lg">{vuln.type}</div>
                          <div className="text-sm mt-2 opacity-90">{vuln.description}</div>
                          {vuln.location && (
                            <div className="text-xs mt-3 font-mono bg-white/70 px-3 py-1.5 rounded-md inline-block">
                              📍 Location: {vuln.location}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {gptAnalysis.recommendations && gptAnalysis.recommendations.length > 0 && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <h4 className="font-bold mb-4 flex items-center gap-2 text-blue-900">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  Recommendations:
                </h4>
                <ul className="space-y-3">
                  {gptAnalysis.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-3 text-sm text-blue-800">
                      <span className="text-blue-500 mt-0.5 font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Code Fixes */}
            {gptAnalysis.codeFixes && gptAnalysis.codeFixes.length > 0 && (
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-200">
                <h4 className="font-bold mb-4 flex items-center gap-2 text-emerald-900">
                  <Code className="w-5 h-5 text-emerald-600" />
                  Suggested Code Fixes:
                </h4>
                <div className="space-y-4">
                  {gptAnalysis.codeFixes.map((fix, index) => (
                    <div key={index} className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                      <div className="font-semibold text-sm mb-3 text-emerald-800">{fix.issue}</div>
                      <pre className="bg-gradient-to-r from-gray-900 to-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-x-auto font-mono">
                        <code>{fix.fix}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Echidna Results */}
        {parsedResults && (
          <>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg">
                <FileSearch className="w-6 h-6" />
              </div>
              <span className="bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
                Echidna Fuzzing Results (Property File)
              </span>
            </h3>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 shadow-lg hover:shadow-xl transition-shadow duration-300 transform hover:scale-105">
                <p className="text-sm text-blue-700 font-medium">Total Tests</p>
                <p className="text-3xl font-bold text-blue-900 mt-2">{parsedResults.testResults.total}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl border border-emerald-200 shadow-lg hover:shadow-xl transition-shadow duration-300 transform hover:scale-105">
                <p className="text-sm text-emerald-700 font-medium">Executed</p>
                <p className="text-3xl font-bold text-emerald-900 mt-2">{parsedResults.testResults.executed}</p>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200 shadow-lg hover:shadow-xl transition-shadow duration-300 transform hover:scale-105">
                <p className="text-sm text-red-700 font-medium">Failed</p>
                <p className="text-3xl font-bold text-red-900 mt-2">{parsedResults.testResults.failed}</p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-300 shadow-lg hover:shadow-xl transition-shadow duration-300 transform hover:scale-105">
                <p className="text-sm text-gray-700 font-medium">Coverage</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{parsedResults.coverage.coverage}</p>
              </div>
            </div>

            {/* Failed Tests */}
            {parsedResults.testResults.failedTest && (
              <div className="mb-8">
                <h4 className="text-lg font-bold mb-4 text-red-800">Failed Test</h4>
                <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-xl p-6 shadow-lg">
                  <p className="font-bold text-red-900 mb-3 text-lg">
                    {parsedResults.testResults.failedTest}: failed! 💥
                  </p>
                  {parsedResults.testResults.callSequence && (
                    <div className="mt-4">
                      <p className="text-sm font-bold text-red-800 mb-3">Call sequence:</p>
                      <pre className="bg-red-900/10 border border-red-300 p-4 rounded-lg text-xs overflow-x-auto text-red-800 font-mono">
                        {parsedResults.testResults.callSequence}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Raw Output */}
        <details className="mt-8 group">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors duration-200 flex items-center gap-2">
            <Code className="w-4 h-4" />
            View Raw Echidna Output
            <span className="text-xs ml-2 text-gray-500">(Click to expand)</span>
          </summary>
          <pre className="mt-4 bg-gradient-to-br from-gray-900 to-gray-800 text-gray-300 p-6 rounded-xl text-xs overflow-x-auto font-mono shadow-inner border border-gray-700">
            {echidnaResults?.output}
          </pre>
        </details>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex flex-col relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-40 left-1/2 w-80 h-80 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Header */}
      <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white p-8 shadow-2xl">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold tracking-tight animate-fadeIn">
            LLM-Powered Smart Contract Fuzzer
          </h1>
          <div className="h-1 w-32 bg-white/30 mt-4 rounded-full"></div>
        </div>
      </div>

      {/* Container */}
      <div className="flex-1 flex justify-center items-center p-8 relative z-10">
        {!isProcessing && !isAnalyzingWithGPT && !echidnaResults && renderUploadSection()}
        {(isProcessing || isAnalyzingWithGPT) && renderProcessingSection()}
        {echidnaResults && !isProcessing && !isAnalyzingWithGPT && renderResultsSection()}
      </div>

      {/* Footer */}
      <div className="relative bg-gradient-to-r from-gray-800 to-gray-900 text-white p-6 text-center shadow-2xl">
        <div className="text-sm font-medium tracking-wide">
          Powered by Echidna and ChatGPT
        </div>
        <div className="h-1 w-24 bg-gradient-to-r from-blue-400 to-purple-400 mt-3 mx-auto rounded-full"></div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
          20%, 40%, 60%, 80% { transform: translateX(2px); }
        }
        
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 90%; }
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.5s ease-out;
        }
        
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        
        .animate-progress {
          animation: progress 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
};

export default LLMFuzzing;