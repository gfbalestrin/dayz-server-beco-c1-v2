#!/usr/bin/env python3
"""
Producer RabbitMQ leve para servidor DayZ
Publica mensagens para filas RabbitMQ no servidor de monitoramento
"""

import sys
import json
import os
import subprocess
import logging
from typing import Optional

# Verificar se modo verbose está ativado (variável de ambiente)
# Definir ANTES de usar em check_and_install_dependencies
VERBOSE = os.environ.get('RABBITMQ_VERBOSE', '0') == '1'

# Verificar e instalar dependências automaticamente
def check_and_install_dependencies():
    """Verifica se pika está instalado e instala se necessário"""
    try:
        import pika
        return True
    except ImportError:
        # Tentar instalar pika
        script_dir = os.path.dirname(os.path.abspath(__file__))
        requirements_file = os.path.join(script_dir, "requirements_dayz.txt")
        venv_dir = os.path.join(script_dir, "venv")
        venv_python = os.path.join(venv_dir, "bin", "python3")
        venv_pip = os.path.join(venv_dir, "bin", "pip")
        
        # Método 1: Se venv existe, usar venv
        if os.path.exists(venv_python):
            if VERBOSE:
                print(f"DEBUG: Usando venv existente: {venv_dir}", file=sys.stderr)
            try:
                # Tentar importar pika do venv
                import importlib.util
                #spec = importlib.util.spec_from_file_location("pika", os.path.join(venv_dir, "lib", "python3.12", "site-packages", "pika", "__init__.py"))
                py_version = f"python{sys.version_info.major}.{sys.version_info.minor}"
                pika_path = os.path.join(venv_dir, "lib", py_version, "site-packages", "pika", "__init__.py")
                spec = importlib.util.spec_from_file_location("pika", pika_path)
                if spec and spec.loader:
                    # pika existe no venv, mas precisa usar o Python do venv
                    # Retornar True mas indicar que precisa usar venv_python
                    return True
            except:
                pass
            
            # Tentar instalar no venv
            if os.path.exists(venv_pip):
                try:
                    if os.path.exists(requirements_file):
                        result = subprocess.run(
                            [venv_pip, "install", "-q", "-r", requirements_file],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            timeout=30
                        )
                    else:
                        result = subprocess.run(
                            [venv_pip, "install", "-q", "pika==1.3.2"],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            timeout=30
                        )
                    if result.returncode == 0:
                        # Tentar importar novamente usando o venv
                        sys.executable = venv_python
                        import pika
                        return True
                except Exception as e:
                    if VERBOSE:
                        print(f"DEBUG: Falha ao instalar no venv: {e}", file=sys.stderr)
        
        # Método 2: Criar venv se não existir
        if not os.path.exists(venv_dir):
            if VERBOSE:
                print(f"DEBUG: Criando venv em: {venv_dir}", file=sys.stderr)
            try:
                result = subprocess.run(
                    [sys.executable, "-m", "venv", venv_dir],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=60
                )
                if result.returncode == 0 and os.path.exists(venv_pip):
                    if VERBOSE:
                        print(f"DEBUG: Venv criado com sucesso. Instalando dependências...", file=sys.stderr)
                    # Instalar pika no venv recém-criado
                    if os.path.exists(requirements_file):
                        result = subprocess.run(
                            [venv_pip, "install", "-q", "-r", requirements_file],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            timeout=60
                        )
                    else:
                        result = subprocess.run(
                            [venv_pip, "install", "-q", "pika==1.3.2"],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            timeout=60
                        )
                    if result.returncode == 0:
                        # Reiniciar o script usando o Python do venv
                        if VERBOSE:
                            print(f"DEBUG: Dependências instaladas no venv. Reiniciando com venv Python...", file=sys.stderr)
                        # Executar novamente com o Python do venv
                        os.execv(venv_python, [venv_python] + sys.argv)
                        # Se chegou aqui, algo deu errado
                        return False
                    else:
                        error_msg = result.stderr.decode('utf-8', errors='ignore')
                        if VERBOSE:
                            print(f"DEBUG: Falha ao instalar no venv: {error_msg}", file=sys.stderr)
                else:
                    error_msg = result.stderr.decode('utf-8', errors='ignore') if result.returncode != 0 else "Venv criado mas pip não encontrado"
                    if VERBOSE:
                        print(f"DEBUG: Falha ao criar venv: {error_msg}", file=sys.stderr)
            except Exception as e:
                if VERBOSE:
                    print(f"DEBUG: Exceção ao criar venv: {e}", file=sys.stderr)
        
        # Método 3: Tentar instalar com --user (pode falhar em sistemas com PEP 668)
        install_methods = []
        if os.path.exists(requirements_file):
            install_methods.append({
                'cmd': [sys.executable, "-m", "pip", "install", "--user", "-q", "-r", requirements_file],
                'desc': f'requirements.txt via {sys.executable} -m pip --user'
            })
        
        install_methods.append({
            'cmd': [sys.executable, "-m", "pip", "install", "--user", "-q", "pika==1.3.2"],
            'desc': f'pika==1.3.2 via {sys.executable} -m pip --user'
        })
        
        # Tentar cada método
        last_error = None
        for method in install_methods:
            try:
                result = subprocess.run(
                    method['cmd'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=30
                )
                
                if result.returncode == 0:
                    # Tentar importar novamente
                    try:
                        import pika
                        if VERBOSE:
                            print(f"DEBUG: pika instalado com sucesso via {method['desc']}", file=sys.stderr)
                        return True
                    except ImportError:
                        # Instalação pode ter sucedido mas ainda não disponível
                        continue
                else:
                    # Capturar erro para debug
                    error_msg = result.stderr.decode('utf-8', errors='ignore')
                    if VERBOSE:
                        print(f"DEBUG: Falha ao instalar via {method['desc']}: {error_msg}", file=sys.stderr)
                    last_error = error_msg
            except subprocess.TimeoutExpired:
                if VERBOSE:
                    print(f"DEBUG: Timeout ao instalar via {method['desc']}", file=sys.stderr)
                last_error = "Timeout na instalação"
            except Exception as e:
                if VERBOSE:
                    print(f"DEBUG: Exceção ao tentar {method['desc']}: {e}", file=sys.stderr)
                last_error = str(e)
        
        # Se chegou aqui, todas as tentativas falharam
        error_details = f"Último erro: {last_error}" if last_error else "Nenhum erro capturado"
        print("ERRO: Não foi possível instalar pika automaticamente após várias tentativas.", file=sys.stderr)
        if VERBOSE or last_error:
            print(f"ERRO: {error_details}", file=sys.stderr)
        print("ERRO: O sistema está usando PEP 668 (externally-managed-environment).", file=sys.stderr)
        print("ERRO: Execute manualmente para criar venv e instalar dependências:", file=sys.stderr)
        print(f"ERRO:   cd {script_dir}", file=sys.stderr)
        print("ERRO:   python3 -m venv venv", file=sys.stderr)
        print("ERRO:   venv/bin/pip install -r requirements_dayz.txt", file=sys.stderr)
        print("ERRO:   OU", file=sys.stderr)
        print("ERRO:   venv/bin/pip install pika==1.3.2", file=sys.stderr)
        return False

# Verificar dependências antes de continuar
if not check_and_install_dependencies():
    sys.exit(1)

# Agora importar pika (já verificado que está disponível)
import pika

# Configurar logging
if VERBOSE:
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
else:
    logging.basicConfig(
        level=logging.WARNING,
        format='%(levelname)s: %(message)s'
    )
logger = logging.getLogger(__name__)

# Caminho do config.json - tentar múltiplos caminhos possíveis
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Tentar encontrar config.json em múltiplos locais possíveis
CONFIG_PATHS = [
    os.path.join(SCRIPT_DIR, "config.json"),  # Mesmo diretório do script
    os.path.join(os.path.dirname(SCRIPT_DIR), "config", "config.json"),  # ../config/config.json
    os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "config", "config.json"),  # ../../config/config.json
]

CONFIG_FILE = None
for path in CONFIG_PATHS:
    if os.path.exists(path):
        CONFIG_FILE = path
        break

# Se não encontrou, usar o primeiro caminho como padrão (para mensagem de erro)
if CONFIG_FILE is None:
    CONFIG_FILE = CONFIG_PATHS[0]


def load_rabbitmq_config() -> Optional[dict]:
    """Carrega configuração RabbitMQ do config.json"""
    global CONFIG_FILE  # Declarar global no início da função
    
    try:
        if not os.path.exists(CONFIG_FILE):
            # Tentar encontrar config.json novamente (caso tenha mudado)
            found_config = None
            for path in CONFIG_PATHS:
                if os.path.exists(path):
                    found_config = path
                    break
            
            if found_config is None:
                logger.warning(f"Arquivo config.json não encontrado. Tentou em: {', '.join(CONFIG_PATHS)}")
                print(f"ERRO: Arquivo config.json não encontrado. Tentou em: {', '.join(CONFIG_PATHS)}", file=sys.stderr)
                return None
            else:
                # Atualizar CONFIG_FILE globalmente
                CONFIG_FILE = found_config
                if VERBOSE:
                    logger.debug(f"Config.json encontrado em: {CONFIG_FILE}")
        
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
            rabbitmq_config = config.get('RabbitMQ', {})
            
            if not rabbitmq_config.get('Enabled', False):
                logger.info("RabbitMQ está desabilitado no config.json")
                if VERBOSE:
                    print("INFO: RabbitMQ está desabilitado no config.json", file=sys.stderr)
                return None
            
            config_dict = {
                'host': rabbitmq_config.get('Host', 'localhost'),
                'port': rabbitmq_config.get('Port', 5672),
                'username': rabbitmq_config.get('Username', 'guest'),
                'vhost': rabbitmq_config.get('VHost', '/'),
                'exchange': rabbitmq_config.get('Exchange', 'dayz.events'),
            }
            
            # Não logar senha por segurança
            if VERBOSE:
                logger.debug(f"Configuração RabbitMQ carregada: host={config_dict['host']}, port={config_dict['port']}, vhost={config_dict['vhost']}, exchange={config_dict['exchange']}")
            
            # Adicionar senha separadamente
            config_dict['password'] = rabbitmq_config.get('Password', 'guest')
            
            return config_dict
    except json.JSONDecodeError as e:
        logger.error(f"Erro ao decodificar JSON do config.json: {e}")
        print(f"ERRO: Falha ao decodificar JSON em {CONFIG_FILE}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        logger.error(f"Erro ao carregar configuração RabbitMQ: {e}")
        print(f"ERRO: Falha ao carregar configuração RabbitMQ: {e}", file=sys.stderr)
        return None


def publish_message(queue: str, message: str, config: dict) -> bool:
    """
    Publica mensagem no RabbitMQ
    
    Args:
        queue: Nome da fila
        message: Mensagem (string ou JSON)
        config: Configuração RabbitMQ
    
    Returns:
        True se publicado com sucesso, False caso contrário
    """
    connection = None
    try:
        if VERBOSE:
            logger.debug(f"Conectando ao RabbitMQ: {config['host']}:{config['port']} (vhost: {config['vhost']})")
        
        # Criar conexão
        credentials = pika.PlainCredentials(config['username'], config['password'])
        parameters = pika.ConnectionParameters(
            host=config['host'],
            port=config['port'],
            virtual_host=config['vhost'],
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300,
            connection_attempts=3,
            retry_delay=2,
        )
        
        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        
        if VERBOSE:
            logger.debug(f"Conectado ao RabbitMQ. Declarando exchange: {config['exchange']}")
        
        # Declarar exchange (topic)
        channel.exchange_declare(
            exchange=config['exchange'],
            exchange_type='topic',
            durable=True
        )
        
        if VERBOSE:
            logger.debug(f"Exchange declarado. Declarando fila: {queue}")
        
        # Declarar fila (durable para persistência)
        channel.queue_declare(queue=queue, durable=True)
        
        # Bind fila ao exchange com routing key igual ao nome da fila
        channel.queue_bind(
            exchange=config['exchange'],
            queue=queue,
            routing_key=queue
        )
        
        if VERBOSE:
            logger.debug(f"Fila {queue} vinculada ao exchange. Publicando mensagem...")
        
        # Publicar mensagem (persistent)
        channel.basic_publish(
            exchange=config['exchange'],
            routing_key=queue,
            body=message,
            properties=pika.BasicProperties(
                delivery_mode=2,  # Torna mensagem persistente
            )
        )
        
        if VERBOSE:
            logger.debug(f"Mensagem publicada com sucesso na fila {queue}")
        
        return True
        
    except pika.exceptions.AMQPConnectionError as e:
        error_msg = f"Erro de conexão RabbitMQ com {config['host']}:{config['port']}: {e}"
        logger.warning(error_msg)
        print(f"ERRO: {error_msg}", file=sys.stderr)
        if VERBOSE:
            import traceback
            print(f"DETALHES: {traceback.format_exc()}", file=sys.stderr)
        return False
    except pika.exceptions.AMQPChannelError as e:
        error_msg = f"Erro de canal RabbitMQ: {e}"
        logger.error(error_msg)
        print(f"ERRO: {error_msg}", file=sys.stderr)
        if VERBOSE:
            import traceback
            print(f"DETALHES: {traceback.format_exc()}", file=sys.stderr)
        return False
    except pika.exceptions.ProbableAuthenticationError as e:
        error_msg = f"Erro de autenticação RabbitMQ (usuário/senha incorretos): {e}"
        logger.error(error_msg)
        print(f"ERRO: {error_msg}", file=sys.stderr)
        if VERBOSE:
            import traceback
            print(f"DETALHES: {traceback.format_exc()}", file=sys.stderr)
        return False
    except pika.exceptions.ProbableAccessDeniedError as e:
        error_msg = f"Acesso negado ao vhost '{config['vhost']}': {e}"
        logger.error(error_msg)
        print(f"ERRO: {error_msg}", file=sys.stderr)
        if VERBOSE:
            import traceback
            print(f"DETALHES: {traceback.format_exc()}", file=sys.stderr)
        return False
    except Exception as e:
        error_msg = f"Erro ao publicar mensagem: {e}"
        logger.error(error_msg)
        print(f"ERRO: {error_msg}", file=sys.stderr)
        if VERBOSE:
            import traceback
            print(f"DETALHES: {traceback.format_exc()}", file=sys.stderr)
        return False
    finally:
        if connection and not connection.is_closed:
            connection.close()
            if VERBOSE:
                logger.debug("Conexão RabbitMQ fechada")


def main():
    """Função principal - chamada via linha de comando"""
    if len(sys.argv) < 2:
        print("Uso: rabbitmq_producer.py <queue> [message]", file=sys.stderr)
        print("      Mensagem será lida de stdin se disponível, caso contrário usa segundo argumento", file=sys.stderr)
        print("      Variável de ambiente RABBITMQ_VERBOSE=1 para modo verbose", file=sys.stderr)
        sys.exit(1)
    
    queue = sys.argv[1]
    message = None
    
    # Sempre tentar ler de stdin primeiro (quando disponível via pipe)
    if not sys.stdin.isatty():
        # stdin está disponível (pipe ou redirecionamento)
        try:
            message = sys.stdin.read()
            if VERBOSE:
                logger.debug(f"Mensagem lida de stdin: {len(message)} caracteres")
        except Exception as e:
            if VERBOSE:
                logger.error(f"Erro ao ler de stdin: {e}")
    
    # Fallback: usar segundo argumento se stdin não estava disponível ou estava vazio
    if not message and len(sys.argv) >= 3:
        message = sys.argv[2]
        if VERBOSE:
            logger.debug(f"Mensagem lida de argumento: {len(message)} caracteres")
    
    if not message:
        print("ERRO: Nenhuma mensagem fornecida (nem via stdin nem via argumento)", file=sys.stderr)
        sys.exit(1)
    
    if VERBOSE:
        logger.debug(f"Iniciando publicação: queue={queue}, message_length={len(message)}")
    
    # Carregar configuração
    config = load_rabbitmq_config()
    if not config:
        # RabbitMQ desabilitado ou erro na configuração
        # Exit code 0 = desabilitado (não é erro crítico)
        # Exit code 2 = erro na configuração (é um erro)
        if not os.path.exists(CONFIG_FILE):
            sys.exit(2)  # Config não encontrado = erro
        sys.exit(0)  # Desabilitado = não é erro
    
    # Publicar mensagem
    success = publish_message(queue, message, config)
    
    if not success:
        sys.exit(1)  # Erro na publicação
    
    sys.exit(0)  # Sucesso


if __name__ == '__main__':
    main()

