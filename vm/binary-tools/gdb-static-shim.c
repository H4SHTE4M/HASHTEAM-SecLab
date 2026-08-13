extern double __ieee754_fmod(double dividend, double divisor);

double fmod(double dividend, double divisor) {
    return __ieee754_fmod(dividend, divisor);
}
