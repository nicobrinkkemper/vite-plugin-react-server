import React from "react";

export const Page = (props: any) => {
    return <div>
        <h1>{props.name}</h1>
        <img src={props.sprites.front_default} alt={props.name} />
        <code>{JSON.stringify(props)}</code>
    </div>
}