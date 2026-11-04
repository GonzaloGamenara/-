/** Columnas de movimientos (sin React: las usa también el servidor) */
export const legacyTxColumns = "id,kind,amount,category_id,note,occurred_on,recurring_id,period";
export const txColumns = `${legacyTxColumns},card_id,purchase_id,installment,my_share`;
