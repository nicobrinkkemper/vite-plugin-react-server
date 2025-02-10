import React from "react";
// @ts-ignore
import styles from "./404.module.css";

export const Page = (props) => {
    return <html>
        <head>
            <title>{props.title}</title>
            <meta name="description" content={props.description} />
        </head>
        <body className={styles.NotFound}>
            <h1>404</h1>
        </body>
    </html>
}