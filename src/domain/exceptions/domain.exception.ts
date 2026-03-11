export class DomainException extends Error {
    constructor(message: string){
        super(message);
        this.name = 'DomainException';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class PaymentException extends DomainException {
    constructor(message: string){
        super(message);
        this.name = 'PaymentException';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class PaymentNotFoundException extends PaymentException {
    constructor(message: string){
        super(message);
        this.name = 'PaymentNotFoundException';
        Error.captureStackTrace(this, this.constructor);
    }
}