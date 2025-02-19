import { HexEncodedBytes, TransactionPayload } from 'aptos/src/generated';
import {
  WalletDisconnectionError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletSignMessageError,
  WalletSignTransactionError
} from '../WalletProviders';
import {
  AccountKeys,
  BaseWalletAdapter,
  scopePollingDetectionStrategy,
  SignMessagePayload,
  SignMessageResponse,
  WalletName,
  WalletReadyState
} from './BaseAdapter';
import { MaybeHexString } from 'aptos';

interface RiseAccount {
  address: MaybeHexString;
  publicKey: MaybeHexString;
  authKey: MaybeHexString;
  isConnected: boolean;
}

interface IRiseWallet {
  connect: () => Promise<{ address: string }>;
  account(): Promise<RiseAccount>;
  isConnected: () => Promise<boolean>;
  signAndSubmitTransaction(transaction: any): Promise<{ hash: HexEncodedBytes }>;
  signTransaction(transaction: any, options?: any): Promise<Uint8Array>;
  signMessage(message: SignMessagePayload): Promise<SignMessageResponse>;
  disconnect(): Promise<void>;
}

interface RiseWindow extends Window {
  rise?: IRiseWallet;
}

declare const window: RiseWindow;

export const RiseWalletName = 'Rise Wallet' as WalletName<'Rise Wallet'>;

export interface RiseWalletAdapterConfig {
  provider?: IRiseWallet;
  // network?: WalletAdapterNetwork;
  timeout?: number;
}

export class RiseWalletAdapter extends BaseWalletAdapter {
  name = RiseWalletName;

  url = 'https://chrome.google.com/webstore/detail/hbbgbephgojikajhfbomhlmmollphcad';

  icon = 'https://static.risewallet.io/logo.png';

  protected _provider: IRiseWallet | undefined;

  // protected _network: WalletAdapterNetwork;
  protected _timeout: number;

  protected _readyState: WalletReadyState =
    typeof window === 'undefined' || typeof document === 'undefined'
      ? WalletReadyState.Unsupported
      : WalletReadyState.NotDetected;

  protected _connecting: boolean;

  protected _wallet: any | null;

  constructor({
    // provider,
    // network = WalletAdapterNetwork.Mainnet,
    timeout = 10000
  }: RiseWalletAdapterConfig = {}) {
    super();

    this._provider = typeof window !== 'undefined' ? window.rise : undefined;
    // this._network = network;
    this._timeout = timeout;
    this._connecting = false;
    this._wallet = null;

    if (typeof window !== 'undefined' && this._readyState !== WalletReadyState.Unsupported) {
      scopePollingDetectionStrategy(() => {
        if (window.rise) {
          this._readyState = WalletReadyState.Installed;
          this.emit('readyStateChange', this._readyState);
          return true;
        }
        return false;
      });
    }
  }

  get publicAccount(): AccountKeys {
    return {
      publicKey: this._wallet?.publicKey || null,
      address: this._wallet?.address || null,
      authKey: this._wallet?.authKey || null
    };
  }

  get connecting(): boolean {
    return this._connecting;
  }

  get connected(): boolean {
    return !!this._wallet?.isConnected;
  }

  get readyState(): WalletReadyState {
    return this._readyState;
  }

  async connect(): Promise<void> {
    try {
      if (this.connected || this.connecting) return;
      if (
        !(
          this._readyState === WalletReadyState.Loadable ||
          this._readyState === WalletReadyState.Installed
        )
      )
        throw new WalletNotReadyError();
      this._connecting = true;

      const provider = this._provider || window.rise;
      const isConnected = await this._provider?.isConnected();
      if (isConnected === true) {
        await provider?.disconnect();
      }

      const response = await provider?.connect();

      if (!response) {
        throw new WalletNotConnectedError('User has rejected the request');
      }

      const account = await provider?.account();
      if (account) {
        const { publicKey, address, authKey } = account;

        this._wallet = {
          publicKey,
          address,
          authKey,
          isConnected: true
        };

        this.emit('connect', this._wallet.publicKey);
      }
    } catch (error: any) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    const wallet = this._wallet;
    if (wallet) {
      this._wallet = null;

      try {
        const provider = this._provider || window.rise;
        await provider?.disconnect();
      } catch (error: any) {
        this.emit('error', new WalletDisconnectionError(error?.message, error));
      }
    }

    this.emit('disconnect');
  }

  async signTransaction(transaction: TransactionPayload): Promise<Uint8Array> {
    try {
      const wallet = this._wallet;
      const provider = this._provider || window.rise;
      if (!wallet || !provider) throw new WalletNotConnectedError();

      const response = await provider?.signTransaction(transaction);
      if (response) {
        return response;
      } else {
        throw new Error('Sign Transaction failed');
      }
    } catch (error: any) {
      const errMsg = error.message;
      this.emit('error', new WalletSignTransactionError(errMsg));
      throw error;
    }
  }

  async signAndSubmitTransaction(
    transaction: TransactionPayload
  ): Promise<{ hash: HexEncodedBytes }> {
    try {
      const wallet = this._wallet;
      const provider = this._provider || window.rise;
      if (!wallet || !provider) throw new WalletNotConnectedError();

      const response = await provider?.signAndSubmitTransaction(transaction);
      if (response) {
        return response;
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      const errMsg = error.message;
      this.emit('error', new WalletSignTransactionError(errMsg));
      throw error;
    }
  }

  async signMessage(msgPayload: SignMessagePayload): Promise<SignMessageResponse> {
    try {
      const wallet = this._wallet;
      const provider = this._provider || window.rise;
      if (!wallet || !provider) throw new WalletNotConnectedError();
      if (typeof msgPayload !== 'object' || !msgPayload.nonce) {
        throw new WalletSignMessageError('Invalid signMessage Payload');
      }
      const response = await provider?.signMessage(msgPayload);
      if (response) {
        return response;
      } else {
        throw new Error('Sign Message failed');
      }
    } catch (error: any) {
      const errMsg = error.message;
      this.emit('error', new WalletSignMessageError(errMsg));
      throw error;
    }
  }
}
