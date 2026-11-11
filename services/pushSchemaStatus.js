let pushSchemaReady = false;

export const isPushSchemaReady = () => pushSchemaReady;
export const setPushSchemaReady = value => { pushSchemaReady = value === true; };
