import { supabaseAdmin } from './lib/automations/admin-client';
import { generateApiKey } from './lib/api-keys/keys';

async function send() {
  const db = supabaseAdmin();

  // 1. Generate an API key for the account
  const key = generateApiKey();
  const { error: keyErr } = await db.from('api_keys').insert({
    account_id: '651a4ed2-3b1c-4720-97fa-2960a039a449',
    created_by: '8c50eb3e-b50a-4213-b66d-9a06bde14afb',
    name: 'Direct API Sender',
    key_prefix: key.prefix,
    key_hash: key.hash,
    scopes: [
      'messages:send',
      'messages:read',
      'contacts:read',
      'contacts:write',
      'conversations:read',
      'broadcasts:send',
      'webhooks:manage',
    ],
  });

  if (keyErr) {
    console.error('Failed to create API key:', keyErr);
    return;
  }

  console.log('API Key generated successfully:', key.prefix);

  // 2. Call POST /api/v1/messages
  const payload = {
    to: '+918359847846',
    type: 'template',
    template: {
      name: 'ars_retargeting_1',
      language: 'en',
      params: ['Yuvraj'],
    },
  };

  console.log(
    'Sending payload to http://localhost:3000/api/v1/messages:',
    JSON.stringify(payload, null, 2)
  );

  const res = await fetch('http://localhost:3000/api/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key.plaintext}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  console.log('Response Status:', res.status);
  console.log('Response Body:', JSON.stringify(result, null, 2));
}

send().catch(console.error);
