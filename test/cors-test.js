import http from 'http';

// Test function to check CORS headers
function testCorsHeaders(host, port, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      headers: {
        'Origin': `http://${host}:${port}`,
        'Accept': path.endsWith('.rsc') ? 'text/x-component' : 'text/html'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data.substring(0, 100) // First 100 chars
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing CORS headers for RSC files...\n');

  const testCases = [
    { host: 'localhost', port: 4173, path: '/index.rsc' },
    { host: '127.0.0.1', port: 4173, path: '/index.rsc' },
    { host: 'localhost', port: 4173, path: '/index.html' },
    { host: '127.0.0.1', port: 4173, path: '/index.html' },
    { host: 'localhost', port: 4174, path: '/index.rsc' },
    { host: '127.0.0.1', port: 4174, path: '/index.rsc' }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`Testing ${testCase.host}:${testCase.port}${testCase.path}`);
      const result = await testCorsHeaders(testCase.host, testCase.port, testCase.path);
      
      console.log(`  Status: ${result.statusCode}`);
      console.log(`  Content-Type: ${result.headers['content-type']}`);
      console.log(`  Access-Control-Allow-Origin: ${result.headers['access-control-allow-origin']}`);
      console.log(`  Access-Control-Allow-Methods: ${result.headers['access-control-allow-methods']}`);
      console.log(`  Access-Control-Allow-Headers: ${result.headers['access-control-allow-headers']}`);
      console.log(`  Data preview: ${result.data}`);
      console.log('');
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      console.log('');
    }
  }
}

// Run the tests
runTests().catch(console.error);
