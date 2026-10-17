import { isOnTick, priceLimits, tickSize } from './market';
import type { Market, Order } from './types';

/** Checks made when an order is entered. Returns Korean messages; empty means the order can be placed. */
export function validateOrder(order: Pick<Order, 'side' | 'type' | 'qty' | 'price'>, market: Market, lastClose: number, held: number): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(order.qty) || order.qty <= 0) errors.push('수량은 1 이상의 정수여야 합니다.');
  if (order.type === 'stop' && order.side !== 'sell') errors.push('손절 주문은 매도만 가능합니다.');
  if (order.side === 'sell' && order.qty > held) errors.push(`보유 수량(${held})보다 많이 팔 수 없습니다.`);
  if (order.type !== 'market') {
    const p = order.price;
    if (p === undefined || !(p > 0)) errors.push('가격을 입력하세요.');
    else {
      if (!isOnTick(market, p)) errors.push(`호가 단위(${tickSize(market, p).toLocaleString()})에 맞지 않습니다.`);
      const lim = priceLimits(market, lastClose);
      if (lim && (p < lim.low || p > lim.high)) {
        errors.push(`가격 제한폭 밖입니다 (${lim.low.toLocaleString()}–${lim.high.toLocaleString()}).`);
      }
      if (order.type === 'stop' && p >= lastClose) errors.push('손절가는 현재가보다 낮아야 합니다.');
    }
  }
  return errors;
}
