import React from 'react';
import { useHistory } from 'react-router-dom';

import styles from './Logo.module.scss';

type LogoProps = {
  src: string;
};

const Logo: React.FC<LogoProps> = ({ src }: LogoProps) => {
  const history = useHistory();

  const handleClick = () => {
    history.push('/');
  };

  return (
    <div className={styles.brand}>
      <img className={styles.logo} alt="logo" src={src} onClick={handleClick} />
    </div>
  );
};

export default Logo;
