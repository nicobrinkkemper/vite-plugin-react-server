export function setupRscResponseHeaders(
  res: any,
  contentType: string = "text/x-component; charset=utf-8",
  stream: boolean = true
) {
  res.setHeader("Content-Type", contentType);
  if (stream) {
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Connection", "keep-alive");
  }
}
