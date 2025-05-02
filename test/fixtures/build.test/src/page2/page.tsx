
"use server"
import React from 'react'
import styles from './test.module.css'

export function Page() {
  return React.createElement('div', {className: styles.test}, 
    React.createElement('span', {className: styles.shared}, 'Test Page 2')
  )
}
