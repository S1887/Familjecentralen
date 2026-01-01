
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

console.log('Current directory:', process.cwd());
console.log('Directory contents:', fs.readdirSync(process.cwd()));
console.log('Checking GEMINI_API_KEY...');

if (process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY: EXISTS');
    console.log('Length:', process.env.GEMINI_API_KEY.length);
    console.log('First 4 chars:', process.env.GEMINI_API_KEY.substring(0, 4));
} else {
    console.log('GEMINI_API_KEY: MISSING');
}
