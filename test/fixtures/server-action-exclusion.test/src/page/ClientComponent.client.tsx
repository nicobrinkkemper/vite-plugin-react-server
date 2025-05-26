"use client"
import React, { useState } from 'react';

export function ClientComponent({add, subtract}) {
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    try {
      const sum = await add(2, 3);
      setResult(sum);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubtract = async () => {
    try {
      const diff = await subtract(5, 2);
      setResult(diff);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <button onClick={handleAdd}>Add 2 + 3</button>
      <button onClick={handleSubtract}>Subtract 5 - 2</button>
      {result !== null && <p>Result: {result}</p>}
      {error && <p>Error: {error}</p>}
    </div>
  );
}