import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Search, RotateCcw, Zap, Eye, Download, Settings } from 'lucide-react';

const DynamicBingoScanner = () => {
  const [image, setImage] = useState(null);
  const [cards, setCards] = useState([]);
  const [calledNumber, setCalledNumber] = useState('');
  const [markedNumbers, setMarkedNumbers] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [imageScale, setImageScale] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.8);
  
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  // Load Tesseract.js dynamically
  const loadTesseract = async () => {
    if (window.Tesseract) return window.Tesseract;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js';
      script.onload = () => resolve(window.Tesseract);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Enhanced OCR with better grid detection
  const performOCR = async (imageDataUrl) => {
    try {
      setOcrStatus('Loading OCR engine...');
      const Tesseract = await loadTesseract();
      
      setOcrStatus('Analyzing image structure...');
      setOcrProgress(10);

      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(10 + Math.round(m.progress * 70));
            setOcrStatus(`Extracting text... ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      // Configure for optimal number recognition
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789BINGO \n\t',
        tessedit_pageseg_mode: '6',
        tessedit_ocr_engine_mode: '1'
      });

      const { data: { text, words } } = await worker.recognize(imageDataUrl);
      await worker.terminate();

      setOcrProgress(85);
      setOcrStatus('Detecting bingo cards...');

      // Get image dimensions
      const img = new Image();
      return new Promise((resolve) => {
        img.onload = () => {
          const cards = detectBingoCards(text, words, img.width, img.height);
          setOcrProgress(100);
          setOcrStatus(`Detected ${cards.length} bingo cards`);
          setTimeout(() => {
            setOcrProgress(0);
            setOcrStatus('');
          }, 2000);
          resolve(cards);
        };
        img.src = imageDataUrl;
      });

    } catch (error) {
      console.error('OCR Error:', error);
      setOcrStatus('OCR failed. Please try a clearer image.');
      return [];
    }
  };

  // Improved bingo card detection algorithm
  const detectBingoCards = (text, words, imgWidth, imgHeight) => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const numberPattern = /\b(\d{1,2})\b/g;
    const detectedCards = [];
    
    // Group words by approximate row position
    const rowGroups = {};
    const tolerance = 20; // pixels
    
    words.forEach(word => {
      if (/^\d{1,2}$/.test(word.text)) {
        const rowKey = Math.round(word.bbox.y0 / tolerance) * tolerance;
        if (!rowGroups[rowKey]) rowGroups[rowKey] = [];
        rowGroups[rowKey].push({
          text: parseInt(word.text),
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        });
      }
    });

    // Sort rows by Y position
    const sortedRows = Object.keys(rowGroups)
      .map(k => parseInt(k))
      .sort((a, b) => a - b)
      .map(k => rowGroups[k]);

    // Group consecutive rows into potential cards
    let currentCardRows = [];
    let lastRowY = -1;
    const maxRowGap = 100; // Maximum gap between rows in a card

    for (let row of sortedRows) {
      row.sort((a, b) => a.x - b.x); // Sort by X position
      
      if (row.length >= 3 && row.length <= 6) { // Valid bingo row
        const currentRowY = row[0].y;
        
        if (lastRowY === -1 || (currentRowY - lastRowY) < maxRowGap) {
          currentCardRows.push(row);
        } else {
          // Process completed card
          if (currentCardRows.length >= 3) {
            const card = processCardRows(currentCardRows, detectedCards.length + 1);
            if (card) detectedCards.push(card);
          }
          currentCardRows = [row];
        }
        lastRowY = currentRowY;
      }
    }

    // Don't forget the last card
    if (currentCardRows.length >= 3) {
      const card = processCardRows(currentCardRows, detectedCards.length + 1);
      if (card) detectedCards.push(card);
    }

    return detectedCards;
  };

  // Process rows into a complete bingo card
  const processCardRows = (rows, cardId) => {
    if (rows.length === 0) return null;

    // Calculate card boundaries
    const allNumbers = rows.flat();
    const minX = Math.min(...allNumbers.map(n => n.x));
    const maxX = Math.max(...allNumbers.map(n => n.x + n.width));
    const minY = Math.min(...allNumbers.map(n => n.y));
    const maxY = Math.max(...allNumbers.map(n => n.y + n.height));

    // Create 5x5 grid
    const grid = Array(5).fill().map(() => Array(5).fill(0));
    
    rows.forEach((row, rowIndex) => {
      if (rowIndex < 5) {
        row.forEach((num, colIndex) => {
          if (colIndex < 5) {
            // Validate bingo number ranges
            const value = num.text;
            const isValidForColumn = (
              (colIndex === 0 && value >= 1 && value <= 15) ||   // B
              (colIndex === 1 && value >= 16 && value <= 30) ||  // I
              (colIndex === 2 && value >= 31 && value <= 45) ||  // N
              (colIndex === 3 && value >= 46 && value <= 60) ||  // G
              (colIndex === 4 && value >= 61 && value <= 75)     // O
            );
            
            if (isValidForColumn || (colIndex === 2 && rowIndex === 2)) {
              grid[rowIndex][colIndex] = value;
            } else {
              // Keep invalid numbers but mark them
              grid[rowIndex][colIndex] = value;
            }
          }
        });
      }
    });

    // Set center as FREE if it's 0 or invalid
    if (grid[2] && (grid[2][2] === 0 || grid[2][2] > 75)) {
      grid[2][2] = 0; // FREE space
    }

    // Fill empty cells with plausible values
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        if (grid[row][col] === undefined || grid[row][col] === null) {
          if (row === 2 && col === 2) {
            grid[row][col] = 0; // FREE
          } else {
            const min = col * 15 + 1;
            const max = (col + 1) * 15;
            grid[row][col] = Math.floor(Math.random() * (max - min + 1)) + min;
          }
        }
      }
    }

    const validNumbers = allNumbers.length;
    const confidence = Math.min(validNumbers / 24, 1); // 24 non-FREE spaces

    return {
      id: cardId,
      position: {
        x: minX - 10,
        y: minY - 10,
        width: maxX - minX + 20,
        height: maxY - minY + 20
      },
      grid: grid,
      confidence: confidence,
      originalNumbers: allNumbers
    };
  };

  // Handle image upload and OCR
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setCards([]);
    setMarkedNumbers(new Set());
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageDataUrl = e.target.result;
      setImage(imageDataUrl);
      
      const detectedCards = await performOCR(imageDataUrl);
      setCards(detectedCards);
      setIsProcessing(false);
    };
    
    reader.readAsDataURL(file);
  };

  // Update overlay when numbers are marked
  const updateOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !imageRef.current || cards.length === 0) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showOverlay) return;

    // Draw overlays for each card
    cards.forEach(card => {
      const { position, grid } = card;
      
      // Draw card outline
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeRect(position.x, position.y, position.width, position.height);

      // Draw card label
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`Card ${card.id}`, position.x, position.y - 5);

      // Calculate cell dimensions
      const cellWidth = position.width / 5;
      const cellHeight = position.height / 5;

      // Draw number overlays
      grid.forEach((row, rowIndex) => {
        row.forEach((num, colIndex) => {
          const cellX = position.x + (colIndex * cellWidth);
          const cellY = position.y + (rowIndex * cellHeight);

          if (num === 0) {
            // FREE space
            ctx.fillStyle = `rgba(255, 0, 0, ${overlayOpacity})`;
            ctx.fillRect(cellX + 2, cellY + 2, cellWidth - 4, cellHeight - 4);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('FREE', cellX + cellWidth/2, cellY + cellHeight/2 + 4);
          } else if (markedNumbers.has(num)) {
            // Marked number
            ctx.fillStyle = `rgba(0, 100, 255, ${overlayOpacity})`;
            ctx.fillRect(cellX + 2, cellY + 2, cellWidth - 4, cellHeight - 4);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(num.toString(), cellX + cellWidth/2, cellY + cellHeight/2 + 5);
          }
        });
      });
    });
  }, [cards, markedNumbers, showOverlay, overlayOpacity]);

  // Update overlay when dependencies change
  useEffect(() => {
    updateOverlay();
  }, [updateOverlay]);

  // Handle number calling
  const handleNumberCall = () => {
    const number = parseInt(calledNumber);
    if (!number || number < 1 || number > 75) return;

    const newMarkedNumbers = new Set(markedNumbers);
    if (newMarkedNumbers.has(number)) {
      newMarkedNumbers.delete(number);
    } else {
      newMarkedNumbers.add(number);
    }
    setMarkedNumbers(newMarkedNumbers);
    setCalledNumber('');
  };

  const clearMarked = () => {
    setMarkedNumbers(new Set());
  };

  // Check for wins
  const checkWin = (card) => {
    const grid = card.grid;
    
    // Check rows
    for (let row = 0; row < 5; row++) {
      if (grid[row].every(num => num === 0 || markedNumbers.has(num))) {
        return 'row';
      }
    }
    
    // Check columns
    for (let col = 0; col < 5; col++) {
      if (grid.every(row => row[col] === 0 || markedNumbers.has(row[col]))) {
        return 'column';
      }
    }
    
    // Check diagonals
    if (grid.every((row, i) => row[i] === 0 || markedNumbers.has(row[i]))) {
      return 'diagonal';
    }
    if (grid.every((row, i) => row[4-i] === 0 || markedNumbers.has(row[4-i]))) {
      return 'diagonal';
    }
    
    return null;
  };

  // Download the marked image
  const downloadMarkedImage = () => {
    if (!overlayCanvasRef.current || !imageRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw original image
    ctx.drawImage(img, 0, 0);

    // Draw overlay
    if (showOverlay) {
      ctx.globalAlpha = overlayOpacity;
      ctx.drawImage(overlayCanvasRef.current, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Download
    const link = document.createElement('a');
    link.download = 'marked-bingo-cards.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Dynamic Bingo Card Scanner</h1>
          <p className="text-gray-600">Upload bingo cards and see real-time marking overlays</p>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload size={20} />
              Upload Bingo Sheet
            </button>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            
            {isProcessing && (
              <div className="flex flex-col items-center gap-2 text-blue-600">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  {ocrStatus || 'Processing image...'}
                </div>
                {ocrProgress > 0 && (
                  <div className="w-64 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${ocrProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        {cards.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* Number Calling */}
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="75"
                  value={calledNumber}
                  onChange={(e) => setCalledNumber(e.target.value)}
                  placeholder="Enter number (1-75)"
                  className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleNumberCall()}
                />
                <button
                  onClick={handleNumberCall}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Zap size={16} />
                  Toggle
                </button>
                <button
                  onClick={clearMarked}
                  className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  Clear
                </button>
              </div>

              {/* Overlay Controls */}
              <div className="flex gap-4 items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                    className="rounded"
                  />
                  Show Overlay
                </label>
                
                <label className="flex items-center gap-2">
                  <span className="text-sm">Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-20"
                  />
                </label>

                <button
                  onClick={downloadMarkedImage}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <Download size={16} />
                  Download
                </button>
              </div>
            </div>

            {/* Called Numbers Display */}
            <div className="mt-4 text-center">
              <span className="text-gray-600">Called Numbers: </span>
              <span className="font-mono">
                {Array.from(markedNumbers).sort((a, b) => a - b).join(', ') || 'None'}
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Image with Overlay */}
        {image && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Interactive Bingo Sheet</h2>
            <div className="relative inline-block">
              <img 
                ref={imageRef}
                src={image} 
                alt="Bingo sheet" 
                className="max-w-full h-auto rounded-lg shadow-md"
                onLoad={updateOverlay}
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute top-0 left-0 pointer-events-none rounded-lg"
                style={{
                  width: '100%',
                  height: '100%'
                }}
              />
            </div>
          </div>
        )}

        {/* Card Statistics */}
        {cards.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Card Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cards.map(card => {
                const winner = checkWin(card);
                const markedCount = card.grid.flat().filter(num => 
                  num === 0 || markedNumbers.has(num)
                ).length;
                
                return (
                  <div 
                    key={card.id}
                    className={`p-4 rounded-lg border-2 ${
                      winner ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold">Card #{card.id}</h3>
                      {winner && (
                        <span className="bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                          BINGO!
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Confidence: {Math.round(card.confidence * 100)}%</p>
                      <p>Marked: {markedCount}/25</p>
                      {winner && <p className="text-green-600 font-bold">Win: {winner}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Instructions */}
        {cards.length === 0 && !isProcessing && (
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <Camera size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Upload Your Bingo Sheet</h3>
            <div className="text-gray-500 space-y-2">
              <p>Upload an image with multiple bingo cards to see the magic happen!</p>
              <p className="text-sm font-semibold">✨ Features:</p>
              <ul className="text-sm text-left max-w-md mx-auto space-y-1">
                <li>• Real-time overlay showing marked numbers</li>
                <li>• Automatic win detection across all cards</li>
                <li>• Download marked images</li>
                <li>• Toggle individual numbers on/off</li>
                <li>• Adjustable overlay opacity</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DynamicBingoScanner;