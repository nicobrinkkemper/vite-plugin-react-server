import React, { createContext } from 'react';

interface CssContextType {
  cssFiles: Set<string>;
  usedClasses: Set<string>;
  addCssFile: (file: string) => void;
  addUsedClass: (className: string) => void;
}

// Create a mutable context value that can be updated synchronously
const cssFiles = new Set<string>();
const usedClasses = new Set<string>();

const CssContext = createContext<CssContextType>({
  cssFiles,
  usedClasses,
  addCssFile: (file: string) => {
    cssFiles.add(file);
  },
  addUsedClass: (className: string) => {
    usedClasses.add(className);
  },
});

export function CssProvider({ children }: { children: React.ReactNode }) {
  // No need for state in server components
  const addCssFile = (file: string) => {
    cssFiles.add(file);
  };

  const addUsedClass = (className: string) => {
    usedClasses.add(className);
  };

  return (
    <CssContext.Provider
      value={{
        cssFiles,
        usedClasses,
        addCssFile,
        addUsedClass,
      }}
    >
      {children}
    </CssContext.Provider>
  );
}

// Export the context directly for use in other components
export { CssContext }; 