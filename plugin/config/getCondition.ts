export const getCondition = (): 'react-client' | 'react-server' => {
  return process.env['NODE_OPTIONS']?.match(/--condition[= ]react-server/) ? 'react-server' : 'react-client';
} 