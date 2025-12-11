import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();

const distDir = __dirname;
const srcDir = path.join(__dirname, '..', 'src');
const htmlPath = path.join(distDir, 'index.html');
const srcHtmlPath = path.join(srcDir, 'index.html');
const configPath = path.join(__dirname, '..', 'config.json');
const configExamplePath = path.join(__dirname, '..', 'config.example.json');

let panelConfig: { apiUrl: string; apiSecret: string; port?: number } = {
  apiUrl: 'http://localhost:3000',
  apiSecret: '',
  port: 3001
};

if (fs.existsSync(configPath)) {
  try {
    panelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('Loaded panel config:', { apiUrl: panelConfig.apiUrl, port: panelConfig.port });
  } catch (error) {
    console.error('Failed to load config.json, using defaults:', error);
  }
} else if (fs.existsSync(configExamplePath)) {
  console.warn('config.json not found. Please copy config.example.json to config.json');
}

if (!fs.existsSync(htmlPath) && fs.existsSync(srcHtmlPath)) {
  fs.copyFileSync(srcHtmlPath, htmlPath);
}

app.get('/', (req, res) => {
  serveIndexWithConfig(req, res);
});

app.use(express.static(distDir, {
  index: false
}));

app.get('*', (req, res) => {
  serveIndexWithConfig(req, res);
});

function serveIndexWithConfig(req: express.Request, res: express.Response) {
  let htmlContent = '';

  if (fs.existsSync(htmlPath)) {
    htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  } else if (fs.existsSync(srcHtmlPath)) {
    htmlContent = fs.readFileSync(srcHtmlPath, 'utf-8');
  } else {
    res.status(404).send('index.html not found');
    return;
  }

  const configScript = `
    <script>
      window.PANEL_CONFIG = {
        apiUrl: ${JSON.stringify(panelConfig.apiUrl)},
        apiSecret: ${JSON.stringify(panelConfig.apiSecret)}
      };
      console.log('Config injected:', window.PANEL_CONFIG);
    </script>
  `;

  if (htmlContent.includes('<script src="app.js"></script>')) {
    htmlContent = htmlContent.replace('<script src="app.js"></script>', configScript + '<script src="app.js"></script>');
  } else if (htmlContent.includes('</head>')) {
    htmlContent = htmlContent.replace('</head>', configScript + '</head>');
  } else {
    htmlContent = htmlContent.replace('<body>', '<body>' + configScript);
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlContent);
}

const PORT = process.env.PORT || panelConfig.port || 3001;

app.listen(PORT, () => {
  console.log(`Panel server running on port ${PORT}`);
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use`);
    console.error(`   Please either:`);
    console.error(`   Stop the process using port ${PORT}`);
    console.error(`   Or add "port": <number> to your config.json\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

