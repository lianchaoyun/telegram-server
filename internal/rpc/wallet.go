package rpc

import (
	"context"

	"github.com/iamxvbaba/td/tg"
	"github.com/iamxvbaba/td/tlprofile"
)

// registerWallet 注册 wallet.* RPC。TDesktop 的内置钱包依赖 TON 链上后端
// （钱包创建/导入、TonConnect、转账），telesrv 不提供这些能力；这里统一返回
// “未启用”的空状态，让钱包界面显示不可用而不是反复报 NOT_IMPLEMENTED。
func (r *Router) registerWallet(d *tlprofile.Dispatcher) {
	registerRPC[*tg.WalletGetStateRequest](d, tlprofile.SemanticMethodWalletGetState, func(ctx context.Context, _ *tg.WalletGetStateRequest) (any, error) {
		if _, _, err := r.currentUserID(ctx); err != nil {
			return nil, internalErr()
		}
		// 空地址 + 零余额：客户端按“尚未创建钱包”处理。
		return &tg.WalletState{}, nil
	})
	registerRPC[*tg.WalletTonConnectGetSessionsRequest](d, tlprofile.SemanticMethodWalletTonConnectGetSessions, func(ctx context.Context, _ *tg.WalletTonConnectGetSessionsRequest) (any, error) {
		if _, _, err := r.currentUserID(ctx); err != nil {
			return nil, internalErr()
		}
		return &tg.WalletTonConnectSessions{
			Sessions: []tg.TonConnectSession{},
		}, nil
	})
}
