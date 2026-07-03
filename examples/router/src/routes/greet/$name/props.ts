// params are threaded in automatically: props(url, { params, request }).
export const props = (_url: string, { params }: { params: { name: string } }) => ({
  name: params.name,
});
