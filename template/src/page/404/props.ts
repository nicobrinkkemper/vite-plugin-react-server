export const props = async (url: string)=>{
    return {
        title: `404 - ${url}`,
        description: `Page not found - ${url}`,
    }
}