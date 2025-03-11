import React from "react";
export const Html = ({ children }: { children: any }) => (
  <html>
    <head></head>
    <body>
      <div id="root">{children}</div>
    </body>
  </html>
);
