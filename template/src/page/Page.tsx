import React from 'react'
import { Link } from '../components/Link'
import styles from './home.module.css.js'
export const Page = ({ url }: { url: string }) => {
    return <div className={styles.Home}>You are on {url}. Go see a pokemon <Link to="/bidoof/">here</Link></div>
}