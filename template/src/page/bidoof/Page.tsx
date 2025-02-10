import React from "react";
// @ts-ignore
import styles from "./bidoof.module.css";
import type { FallbackData } from "./fallbackData";
export const Page = (props: FallbackData) => {
    return <html>
        <head>
            <title>{props.title}</title>
            <meta name="description" content={props.description} />
        </head>
        <body className={styles.Bidoof}>
            <h1>{props.name}</h1>
            <div className={styles.Images}>
            <img src={props.sprites.front_shiny} alt={props.name} className={styles.Image} />
            <img src={props.sprites.back_shiny} alt={props.name} className={styles.Image} />
            </div>
            <div className={styles.Images}>
            <img src={props.sprites.front_female} alt={props.name} className={styles.Image} />
            <img src={props.sprites.back_female} alt={props.name} className={styles.Image} />
            </div>
            <div className={styles.Images}>
            <img src={props.sprites.front_shiny} alt={props.name} className={styles.Image} />
            <img src={props.sprites.back_shiny} alt={props.name} className={styles.Image} />
            </div>
            <code className={styles.Code}>{JSON.stringify(props)}</code>
        </body>
    </html>
}