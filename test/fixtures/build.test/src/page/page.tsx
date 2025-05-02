
import React from 'react'
import styles from './test.module.css'
import { Link } from '../components/Link.client.js'
export function Page(props: any) {
  console.log("Test Page rendering", props, styles.test, styles.shared);
  return (
    <div className={styles.test}>
      <span className={styles.shared}>Page</span>
      <Link to="/page2">Go to Page 2</Link>
    </div>
  )
}
