"use server";

export function add(a, b) {
  const error = new Error('Test error');
  error.name = 'Error';
  error.digest = '';
  throw error;
}

export function subtract(a, b) {
  return a - b;
}