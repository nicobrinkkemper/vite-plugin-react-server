import React from 'react'
import { Link } from '../components/Link.js'
// @ts-ignore
import styles from './home.module.css'
export const Page = ({ url }: { url: string }) => {
    return <html>
        <head>
            <title>Home</title>
            <meta name="description" content="Home" />
        </head>
        <body>
            <div className={styles['Home']}>You are on {url}. Go see a pokemon <Link to="/bidoof/">here</Link></div>
        </body>
    </html>
}