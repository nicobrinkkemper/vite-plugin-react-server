import React from 'react'
import { Link } from '../components/Link'

export const Page = ({ url }: { url: string }) => {
    return <div>You are on {url}. Go see a pokemon <Link to="/bidoof/">here</Link></div>
}