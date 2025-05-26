import React from 'react';
import { ClientComponent } from './ClientComponent.client.js';

export async function Page({add, subtract}) {
  const addResult = await add(2, 3);
  const subtractResult = await subtract(5, 2);
  
  return (
    <div>
      <h1>Server Actions Test</h1>
      <p>Server-side Add: {addResult}</p>
      <p>Server-side Subtract: {subtractResult}</p>
      <ClientComponent add={add} subtract={subtract} />
    </div>
  );
}